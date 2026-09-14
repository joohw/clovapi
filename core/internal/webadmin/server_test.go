package webadmin

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/desktop"
)

type fakeProxy struct{ running bool }

func (p *fakeProxy) Status() (any, error) {
	return map[string]any{"ok": true, "running": p.running}, nil
}
func (p *fakeProxy) Start(int, string) (any, error)          { p.running = true; return p.Status() }
func (p *fakeProxy) Stop() (any, error)                      { p.running = false; return p.Status() }
func (p *fakeProxy) Save(desktop.UIProxyConfig) (any, error) { return p.Status() }
func testServer() *Server {
	return &Server{Proxy: &fakeProxy{}, Authorities: []string{"127.0.0.1:27484"}, Assets: fstest.MapFS{
		"index.html":     &fstest.MapFile{Data: []byte("<html>browser application</html>")},
		"assets/main.js": &fstest.MapFile{Data: []byte("window.loaded=true;")},
	}}
}
func adminRequest(handler http.Handler, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:27484/api/admin/"+path, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:5000"
	req.Header.Set("Origin", "http://127.0.0.1:27484")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Clovapi-Admin", "1")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	return w
}
func TestManagementRejectsCrossOriginAndRemoteRequests(t *testing.T) {
	h := testServer().Handler()
	for _, tc := range []struct{ name, remote, host, origin, header string }{
		{"LAN", "192.168.1.10:5000", "127.0.0.1:27484", "http://127.0.0.1:27484", "1"},
		{"DNS rebinding", "127.0.0.1:5000", "attacker.example:27484", "http://attacker.example:27484", "1"},
		{"CSRF", "127.0.0.1:5000", "127.0.0.1:27484", "https://attacker.example", "1"},
		{"simple request", "127.0.0.1:5000", "127.0.0.1:27484", "http://127.0.0.1:27484", ""},
		{"opaque origin", "127.0.0.1:5000", "127.0.0.1:27484", "null", "1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://"+tc.host+"/api/admin/info", strings.NewReader("{}"))
			r.RemoteAddr = tc.remote
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("X-Clovapi-Admin", tc.header)
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusForbidden {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}
func TestProxyStopLeavesManagementAndAssetsAvailable(t *testing.T) {
	h := testServer().Handler()
	for _, action := range []string{"start", "stop", "start", "stop"} {
		w := adminRequest(h, "proxy/"+action, "{}")
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		var result struct{ Running bool }
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Running != (action == "start") {
			t.Fatalf("unexpected running state after %s", action)
		}
		if w := adminRequest(h, "info", "{}"); w.Code != 200 {
			t.Fatal("management stopped")
		}
		for _, path := range []string{"/", "/assets/main.js"} {
			r := httptest.NewRequest("GET", "http://127.0.0.1:27484"+path, nil)
			r.RemoteAddr = "127.0.0.1:5000"
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 200 {
				t.Fatalf("asset %s: %d", path, w.Code)
			}
		}
	}
}
func TestProfilesPersistAndMalformedRequestsDoNotWrite(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	h := testServer().Handler()
	w := adminRequest(h, "profiles/save", `{"profiles":[{"name":"Custom API","kind":"api","modelAdapter":"manual","apiKey":"test-secret","baseUrl":"https://example.invalid/v1","models":[{"id":"test-model","model":"test-model","apiStyle":"openai-chat","baseUrl":"https://example.invalid/v1","apiKey":"test-secret"}]}]}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatal(w.Body.String())
	}
	if w = adminRequest(h, "profiles/save", `{"profiles":`); w.Code != 400 {
		t.Fatal("malformed JSON accepted")
	}
	for _, invalid := range []string{`null`, `{}`, `{"profiles":null}`} {
		if response := adminRequest(h, "profiles/save", invalid); response.Code != 400 {
			t.Fatal("invalid save accepted")
		}
	}
	w = adminRequest(h, "profiles/load", "{}")
	if !strings.Contains(w.Body.String(), "Custom API") || !strings.Contains(w.Body.String(), "test-secret") {
		t.Fatal("saved profiles not loaded")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("credentials may be cached")
	}
}
func TestUnknownAPIAndInvalidLoginAreRejected(t *testing.T) {
	h := testServer().Handler()
	for _, tc := range []struct{ path, body string }{
		{"run-clovapi", `{"args":["reset"]}`},
		{"auth/login", `{"provider":"other"}`},
		{"auth/login", `{"provider":"codex","credentialRef":"../escape.json"}`},
		{"auth/login", `{"provider":"codex","credentialRef":"profiles.json"}`},
	} {
		if w := adminRequest(h, tc.path, tc.body); w.Code != 400 {
			t.Fatalf("%s accepted: %s", tc.path, w.Body.String())
		}
	}
}

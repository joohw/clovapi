package webadmin

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDevelopmentUIReceivesPagesAndAssets(t *testing.T) {
	for _, tc := range []struct {
		method string
		target string
	}{
		{http.MethodGet, "/"},
		{http.MethodHead, "/?view=models"},
		{http.MethodGet, "/src/pages/Models.tsx?t=123&name=model%2Fone"},
		{http.MethodHead, "/assets/main.css?direct&v=2"},
	} {
		t.Run(tc.method+" "+tc.target, func(t *testing.T) {
			s := testServer()
			calls := 0
			s.DevUI = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != tc.method || r.URL.RequestURI() != tc.target {
					t.Errorf("forwarded %s %s, want %s %s", r.Method, r.URL.RequestURI(), tc.method, tc.target)
				}
				w.Header().Set("X-Development-UI", "vite")
				w.WriteHeader(http.StatusAccepted)
			})
			r := httptest.NewRequest(tc.method, "http://127.0.0.1:27484"+tc.target, nil)
			r.RemoteAddr = "127.0.0.1:5000"
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, r)
			if calls != 1 || w.Code != http.StatusAccepted || w.Header().Get("X-Development-UI") != "vite" {
				t.Fatalf("development UI response: calls=%d status=%d headers=%v", calls, w.Code, w.Header())
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("development UI response may be cached")
			}
		})
	}
}

func TestDevelopmentUILeavesManagementAPILocal(t *testing.T) {
	s := testServer()
	s.DevUI = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("management request forwarded to development UI: %s %s", r.Method, r.URL.Path)
		w.WriteHeader(http.StatusBadGateway)
	})
	w := adminRequest(s.Handler(), "proxy/status", "{}")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"running":false`) {
		t.Fatalf("local management response: %d %s", w.Code, w.Body.String())
	}
}

func TestDevelopmentUIRequiresLocalAuthorizedRequests(t *testing.T) {
	for _, tc := range []struct {
		name   string
		remote string
		host   string
		origin string
	}{
		{"remote address", "192.168.1.10:5000", "127.0.0.1:27484", ""},
		{"bad host", "127.0.0.1:5000", "attacker.example:27484", ""},
		{"bad origin", "127.0.0.1:5000", "127.0.0.1:27484", "https://attacker.example"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := testServer()
			s.DevUI = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				t.Error("unauthorized request reached development UI")
			})
			r := httptest.NewRequest(http.MethodGet, "http://"+tc.host+"/", nil)
			r.RemoteAddr = tc.remote
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, r)
			if w.Code != http.StatusForbidden {
				t.Fatalf("got %d, want forbidden", w.Code)
			}
		})
	}
}

func TestDevelopmentUIRejectsNonReadMethods(t *testing.T) {
	s := testServer()
	s.DevUI = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("non-read request reached development UI")
	})
	r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:27484/", nil)
	r.RemoteAddr = "127.0.0.1:5000"
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("got %d, want method not allowed", w.Code)
	}
}

func TestDevVersionWithoutDevelopmentUIServesEmbeddedAssets(t *testing.T) {
	s := testServer()
	s.Dev = true
	h := s.Handler()
	for _, tc := range []struct {
		path string
		body string
	}{
		{"/", "<html>browser application</html>"},
		{"/assets/main.js", "window.loaded=true;"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:27484"+tc.path, nil)
			r.RemoteAddr = "127.0.0.1:5000"
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusOK || w.Body.String() != tc.body {
				t.Fatalf("embedded response: %d %q", w.Code, w.Body.String())
			}
		})
	}
}

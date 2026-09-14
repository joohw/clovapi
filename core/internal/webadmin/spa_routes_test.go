package webadmin

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestApplicationRoutesServeEmbeddedEntry(t *testing.T) {
	h := testServer().Handler()
	for _, path := range []string{"/", "/models", "/providers", "/call-logs", "/system-logs", "/settings"} {
		paths := []string{path}
		if path != "/" {
			paths = append(paths, path+"/")
		}
		for _, target := range paths {
			for _, method := range []string{http.MethodGet, http.MethodHead} {
				t.Run(method+" "+target, func(t *testing.T) {
					r := httptest.NewRequest(method, "http://127.0.0.1:27484"+target+"?view=all&model=example%2Fone", nil)
					r.RemoteAddr = "127.0.0.1:5000"
					w := httptest.NewRecorder()
					h.ServeHTTP(w, r)
					if w.Code != http.StatusOK || w.Header().Get("Location") != "" {
						t.Fatalf("direct navigation: %d location=%q body=%q", w.Code, w.Header().Get("Location"), w.Body.String())
					}
					if !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") || w.Header().Get("Cache-Control") != "no-store" {
						t.Fatalf("entry headers: %v", w.Header())
					}
					wantBody := "<html>browser application</html>"
					if method == http.MethodHead {
						wantBody = ""
					}
					if w.Body.String() != wantBody {
						t.Fatalf("entry body: got %q, want %q", w.Body.String(), wantBody)
					}
				})
			}
		}
	}
}

func TestApplicationRoutesDoNotReplaceMissingResources(t *testing.T) {
	h := testServer().Handler()
	for _, path := range []string{"/missing", "/models/missing", "/providers/settings", "/models//", "/assets/missing.js", "/providers/assets/main.js", "/apiicons/missing.svg"} {
		t.Run(path, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:27484"+path, nil)
			r.RemoteAddr = "127.0.0.1:5000"
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusNotFound || strings.Contains(w.Body.String(), "browser application") {
				t.Fatalf("missing resource became application entry: %d %q", w.Code, w.Body.String())
			}
		})
	}
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		t.Run(method+" unknown API", func(t *testing.T) {
			r := httptest.NewRequest(method, "http://127.0.0.1:27484/api/admin/missing", strings.NewReader("{}"))
			r.RemoteAddr = "127.0.0.1:5000"
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("X-Clovapi-Admin", "1")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			wantStatus := http.StatusMethodNotAllowed
			if method == http.MethodPost {
				wantStatus = http.StatusBadRequest
			}
			if w.Code != wantStatus || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
				t.Fatalf("unknown API response changed: %d %q", w.Code, w.Body.String())
			}
		})
	}
}

func TestApplicationRoutesRequireLocalReadRequests(t *testing.T) {
	h := testServer().Handler()
	for _, tc := range []struct {
		name, method, remote, host, origin string
		status                             int
	}{
		{"remote address", http.MethodGet, "192.168.1.10:5000", "127.0.0.1:27484", "", http.StatusForbidden},
		{"bad host", http.MethodGet, "127.0.0.1:5000", "attacker.example:27484", "", http.StatusForbidden},
		{"bad origin", http.MethodGet, "127.0.0.1:5000", "127.0.0.1:27484", "https://attacker.example", http.StatusForbidden},
		{"POST", http.MethodPost, "127.0.0.1:5000", "127.0.0.1:27484", "", http.StatusMethodNotAllowed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "http://"+tc.host+"/settings", nil)
			r.RemoteAddr = tc.remote
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("got %d, want %d", w.Code, tc.status)
			}
		})
	}
}

func TestApplicationRoutesReportMissingEmbeddedBuild(t *testing.T) {
	s := testServer()
	s.Assets = fstest.MapFS{}
	h := s.Handler()
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		r := httptest.NewRequest(method, "http://127.0.0.1:27484/providers/", nil)
		r.RemoteAddr = "127.0.0.1:5000"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s: got %d, want missing-build response", method, w.Code)
		}
		if method == http.MethodHead && w.Body.Len() != 0 {
			t.Fatal("HEAD missing-build response included a body")
		}
	}
}

func TestDevelopmentUIReceivesApplicationRouteUnchanged(t *testing.T) {
	s := testServer()
	s.DevUI = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/providers/?tab=codex" {
			t.Errorf("application route was rewritten before development proxy: %s", r.URL.RequestURI())
		}
		w.WriteHeader(http.StatusAccepted)
	})
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:27484/providers/?tab=codex", nil)
	r.RemoteAddr = "127.0.0.1:5000"
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("application route bypassed development UI: %d", w.Code)
	}
}

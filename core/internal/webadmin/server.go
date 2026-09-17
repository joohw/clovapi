// Package webadmin serves the local browser UI and its management API.
// It intentionally uses a separate loopback listener from the proxy daemon.
package webadmin

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"sync"

	"github.com/clovapi/switcher/internal/buildinfo"
	"github.com/clovapi/switcher/internal/desktop"
	"github.com/clovapi/switcher/internal/webui"
)

type ProxyControl interface {
	Status() (any, error)
	Start(port int, host string) (any, error)
	Stop() (any, error)
	Save(desktop.UIProxyConfig) (any, error)
}

type Server struct {
	Proxy ProxyControl
	// Authorities are exact host:port pairs, including Vite only during development.
	Authorities []string
	Dev         bool
	Assets      fs.FS
	// DevUI serves Vite assets and HMR only when serve --dev is explicit.
	DevUI http.Handler
	mu    sync.Mutex
	jobs  map[string]*loginJob
}

func (s *Server) Handler() http.Handler {
	assets := s.Assets
	if assets == nil {
		assets = webui.Assets()
	}
	files := http.FileServer(http.FS(assets))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Cache-Control", "no-store")
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		ip := net.ParseIP(host)
		if err != nil || ip == nil || !ip.IsLoopback() || !s.allowed(r.Host) {
			write(w, http.StatusForbidden, map[string]any{"ok": false, "error": "Management is available only from localhost"})
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && !s.allowedOrigin(origin) {
			write(w, http.StatusForbidden, map[string]any{"ok": false, "error": "Cross-origin management request rejected"})
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if r.Method != http.MethodPost {
				w.Header().Set("Allow", "POST")
				write(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "POST required"})
				return
			}
			media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if r.Header.Get("X-Clovapi-Admin") != "1" || media != "application/json" {
				write(w, http.StatusForbidden, map[string]any{"ok": false, "error": "JSON management request required"})
				return
			}
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
			if err != nil {
				write(w, http.StatusRequestEntityTooLarge, failure(err))
				return
			}
			if !json.Valid(body) || !strings.HasPrefix(strings.TrimSpace(string(body)), "{") {
				write(w, http.StatusBadRequest, failure(fmt.Errorf("invalid JSON")))
				return
			}
			result, err := s.dispatch(r, body)
			if err != nil {
				write(w, http.StatusBadRequest, failure(err))
				return
			}
			write(w, http.StatusOK, result)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if s.DevUI != nil {
			s.DevUI.ServeHTTP(w, r)
			return
		}
		if isApplicationRoute(r.URL.Path) {
			if _, err := fs.Stat(assets, "index.html"); err != nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusServiceUnavailable)
				if r.Method != http.MethodHead {
					_, _ = w.Write(webui.MissingPage)
				}
				return
			}
			// Serve the application entry without redirecting or rewriting the
			// browser URL. All other paths retain normal static-file behavior.
			r = r.Clone(r.Context())
			r.URL.Path = "/"
			r.URL.RawPath = ""
		}
		files.ServeHTTP(w, r)
	})
}

func isApplicationRoute(path string) bool {
	if path == "/" {
		return true
	}
	switch strings.TrimSuffix(path, "/") {
	case "/models", "/providers", "/call-logs", "/system-logs", "/settings":
		return true
	default:
		return false
	}
}

func (s *Server) allowed(host string) bool {
	for _, authority := range s.Authorities {
		if strings.EqualFold(host, authority) {
			return true
		}
	}
	return false
}
func (s *Server) allowedOrigin(origin string) bool {
	for _, authority := range s.Authorities {
		if origin == "http://"+authority {
			return true
		}
	}
	return false
}
func failure(err error) map[string]any { return map[string]any{"ok": false, "error": err.Error()} }
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *Server) dispatch(r *http.Request, body []byte) (any, error) {
	var p struct {
		Provider      string `json:"provider"`
		Model         string `json:"model"`
		Vendor        string `json:"vendor"`
		CredentialRef string `json:"credentialRef"`
		ID            string `json:"id"`
		Host          string `json:"host"`
		Port          int    `json:"port"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, err
	}
	switch r.URL.Path {
	case "/api/admin/info":
		_, err := exec.LookPath("ollama")
		return map[string]any{"ok": true, "version": buildinfo.Display(), "isDev": s.Dev, "ollamaInstalled": err == nil}, nil
	case "/api/admin/profiles/load":
		return loadProfiles(r), nil
	case "/api/admin/profiles/save":
		input, err := desktop.ParseSaveInput(body)
		if err != nil {
			return nil, err
		}
		if input.Profiles == nil {
			return nil, fmt.Errorf("profiles must be an array")
		}
		return desktop.SaveProfiles(input), nil
	case "/api/admin/profiles/models":
		return desktop.ListModels(), nil
	case "/api/admin/profiles/catalog":
		return desktop.VendorCatalog(), nil
	case "/api/admin/profiles/list-models":
		return desktop.ListVendorModelsWithCredential(p.Vendor, p.CredentialRef), nil
	case "/api/admin/profiles/usage":
		return desktop.QueryVendorUsageWithCredential(p.Vendor, p.CredentialRef), nil
	case "/api/admin/profiles/test":
		if p.Provider == "" || p.Model == "" {
			return nil, fmt.Errorf("provider and model required")
		}
		return desktop.TestProviderModel(p.Provider, p.Model, p.Port), nil
	case "/api/admin/proxy/status", "/api/admin/proxy/health":
		return s.Proxy.Status()
	case "/api/admin/proxy/start":
		return s.Proxy.Start(p.Port, p.Host)
	case "/api/admin/proxy/stop":
		return s.Proxy.Stop()
	case "/api/admin/proxy/config":
		var input desktop.UIProxyConfig
		if err := json.Unmarshal(body, &input); err != nil {
			return nil, err
		}
		return s.Proxy.Save(input)
	case "/api/admin/logs/list":
		return logs(body, false)
	case "/api/admin/logs/clear":
		return logs(body, true)
	case "/api/admin/auth/status":
		return desktop.AuthStatus(), nil
	case "/api/admin/auth/logout":
		return desktop.AuthLogout(p.Provider), nil
	case "/api/admin/auth/login":
		return s.startLogin(p.Provider, p.CredentialRef)
	case "/api/admin/auth/poll":
		return s.pollLogin(p.ID)
	case "/api/admin/auth/cancel":
		return s.cancelLogin(p.Provider)
	default:
		return nil, fmt.Errorf("unknown management endpoint")
	}
}

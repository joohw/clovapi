package platformbackend

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type APIConfig struct {
	AuthSecret     string
	ResendAPIKey   string
	ResendFrom     string
	PublicOrigin   string
	AllowedOrigins []string
	SecureCookies  bool
}

type API struct {
	store   *Store
	relay   http.Handler
	config  APIConfig
	origins map[string]bool
}

func NewAPI(store *Store, relayHandler http.Handler, cfg APIConfig) *API {
	origins := make(map[string]bool, len(cfg.AllowedOrigins))
	for _, origin := range cfg.AllowedOrigins {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" {
			origins[origin] = true
		}
	}
	return &API{store: store, relay: relayHandler, config: cfg, origins: origins}
}

func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if origin := strings.TrimRight(r.Header.Get("Origin"), "/"); origin != "" && a.origins[origin] {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Add("Vary", "Origin")
	}
	if r.Method == http.MethodOptions && strings.HasPrefix(r.URL.Path, "/api/") {
		if !a.allowedOrigin(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "600")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.URL.Path {
	case "/api/auth/code":
		a.authCode(w, r)
	case "/api/auth/verify":
		a.authVerify(w, r)
	case "/api/auth/session":
		a.authSession(w, r)
	case "/api/auth/logout":
		a.authLogout(w, r)
	case "/api/platform":
		a.platform(w, r)
	case "/api/node/register":
		a.registerNode(w, r)
	case "/api/node/bind", "/api/node/sync", "/api/node/poll":
		writeJSON(w, 426, map[string]any{"ok": false, "error": "upgrade_required"})
	default:
		a.relay.ServeHTTP(w, r)
	}
}

func (a *API) allowedOrigin(r *http.Request) bool {
	origin := strings.TrimRight(r.Header.Get("Origin"), "/")
	if origin == "" {
		return false
	}
	return a.origins[origin]
}

func decodeJSON(w http.ResponseWriter, r *http.Request, limit int64, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func method(w http.ResponseWriter, r *http.Request, allowed string) bool {
	if r.Method == allowed {
		return true
	}
	w.Header().Set("Allow", allowed)
	writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method_not_allowed"})
	return false
}

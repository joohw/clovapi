// Package relay serves the platform's persistent node connections and streams
// API traffic without persisting request or response bodies.
package relay

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Config struct {
	ControlPlaneURL string
	FrontendURL     string
	Secret          string
	TrustProxy      bool
	Controller      Controller
	ServiceName     string
}

type Server struct {
	mu                 sync.Mutex
	nodes              map[string]*node
	closed             bool
	completionClosed   bool
	secret             string
	serviceName        string
	controller         Controller
	client             *http.Client
	proxy              *httputil.ReverseProxy
	ctx                context.Context
	cancel             context.CancelFunc
	wg                 sync.WaitGroup
	requests           sync.WaitGroup
	connections        sync.WaitGroup
	pendingCompletions sync.WaitGroup
	completions        chan completion
	catalog            catalogCache
	catalogWake        chan struct{}
}

func New(cfg Config) (*Server, error) {
	if cfg.Secret != "" && (len(cfg.Secret) < 32 || strings.ContainsAny(cfg.Secret, "\r\n")) {
		return nil, fmt.Errorf("CLOVAPI_RELAY_SECRET must contain at least 32 characters")
	}
	var controller Controller = cfg.Controller
	var controlOrigin *url.URL
	if controller == nil {
		if len(cfg.Secret) < 32 {
			return nil, fmt.Errorf("CLOVAPI_RELAY_SECRET must contain at least 32 characters")
		}
		var err error
		controlOrigin, err = parseOrigin(cfg.ControlPlaneURL)
		if err != nil {
			return nil, fmt.Errorf("control plane must be an HTTP(S) origin")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	serviceName := cfg.ServiceName
	if serviceName == "" {
		serviceName = "clovapi-relay"
	}
	s := &Server{nodes: make(map[string]*node), secret: cfg.Secret, serviceName: serviceName, controller: controller, ctx: ctx, cancel: cancel, completions: make(chan completion, 2048), catalogWake: make(chan struct{}, 1)}
	s.catalog.now = time.Now
	s.client = &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	if s.controller == nil {
		s.controller = &httpController{url: controlOrigin.String() + "/api/internal/relay", secret: cfg.Secret, client: s.client}
	}
	frontend := cfg.FrontendURL
	if frontend == "" && cfg.Controller == nil {
		frontend = cfg.ControlPlaneURL
	}
	if frontend != "" {
		if len(cfg.Secret) < 32 {
			return nil, fmt.Errorf("CLOVAPI_RELAY_SECRET is required when frontend proxying is enabled")
		}
		u, err := parseOrigin(frontend)
		if err != nil {
			return nil, fmt.Errorf("frontend must be an HTTP(S) origin")
		}
		s.proxy = &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.SetURL(u)
				pr.Out.Host = pr.In.Host
				// The Next app needs the browser's public origin for same-origin checks
				// and connection commands. Ignore client-supplied forwarding headers.
				pr.SetXForwarded()
				if cfg.TrustProxy && pr.In.Header.Get("X-Forwarded-Proto") == "https" {
					pr.Out.Header.Set("X-Forwarded-Proto", "https")
				} else if pr.In.TLS != nil {
					pr.Out.Header.Set("X-Forwarded-Proto", "https")
				}
				origin := pr.Out.Header.Get("X-Forwarded-Proto") + "://" + pr.In.Host
				mac := hmac.New(sha256.New, []byte(cfg.Secret))
				_, _ = mac.Write([]byte(origin))
				pr.Out.Header.Set("X-Clovapi-Origin", origin)
				pr.Out.Header.Set("X-Clovapi-Origin-Signature", base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))
			},
			ErrorLog: log.New(io.Discard, "", 0),
			ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
				writeError(w, 503, "control_plane_unavailable")
			},
			FlushInterval: -1,
		}
	}
	for i := 0; i < 4; i++ {
		s.wg.Add(1)
		go s.completionWorker()
	}
	s.wg.Add(1)
	go s.catalogWorker()
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	requestPath := path.Clean(strings.ReplaceAll(r.URL.Path, "\\", "/"))
	switch {
	case requestPath == "/health":
		s.health(w, r)
	case requestPath == "/api/internal" || strings.HasPrefix(requestPath, "/api/internal/"):
		http.NotFound(w, r)
	case requestPath == "/internal/events":
		s.events(w, r)
	case requestPath == "/internal" || strings.HasPrefix(requestPath, "/internal/"):
		http.NotFound(w, r)
	case requestPath == "/api/node/connect":
		s.connect(w, r)
	case requestPath == "/api/models":
		s.modelCatalog(w, r)
	case requestPath == "/v1/models":
		s.models(w, r)
	case requestPath == "/v1/chat/completions" || requestPath == "/v1/responses":
		s.request(w, r)
	case strings.HasPrefix(requestPath, "/v1/"):
		writeError(w, 404, "not_found")
	default:
		if s.proxy == nil {
			http.NotFound(w, r)
			return
		}
		s.proxy.ServeHTTP(w, r)
	}
}

func parseOrigin(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("invalid origin")
	}
	u.Path = ""
	return u, nil
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "service": s.serviceName})
}

func (s *Server) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	nodes := make([]*node, 0, len(s.nodes))
	for _, n := range s.nodes {
		nodes = append(nodes, n)
	}
	s.mu.Unlock()
	for _, n := range nodes {
		n.close(websocket.CloseGoingAway, "relay_shutdown")
	}
	// Admission is closed before waiting, so no new request can add work here.
	// Cancellation wakes consumer handlers and completion metadata is given a
	// bounded grace period before outstanding control-plane calls are aborted.
	drained := make(chan struct{})
	go func() {
		s.requests.Wait()
		s.connections.Wait()
		s.pendingCompletions.Wait()
		close(drained)
	}()
	select {
	case <-drained:
	case <-time.After(5 * time.Second):
	}
	s.mu.Lock()
	s.completionClosed = true
	s.mu.Unlock()
	s.cancel()
	s.wg.Wait()
	for len(s.completions) > 0 {
		<-s.completions
		s.pendingCompletions.Done()
	}
	s.client.CloseIdleConnections()
	return nil
}

func Run(ctx context.Context, listen string, cfg Config) error {
	s, err := New(cfg)
	if err != nil {
		return err
	}
	defer s.Close()
	h := &http.Server{Addr: listen, Handler: s, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 75 * time.Second, MaxHeaderBytes: 32 * 1024, ErrorLog: log.New(io.Discard, "", 0)}
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			s.Close()
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = h.Shutdown(shutdown)
		case <-done:
		}
	}()
	err = h.ListenAndServe()
	close(done)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func bearer(r *http.Request) string {
	a := r.Header.Get("Authorization")
	if !strings.HasPrefix(a, "Bearer ") {
		return ""
	}
	a = strings.TrimPrefix(a, "Bearer ")
	if a == "" || len(a) > 2048 || strings.ContainsAny(a, " \r\n\t") {
		return ""
	}
	return a
}

func writeError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"type": "relay_error", "code": code, "message": strings.ReplaceAll(code, "_", " ")}})
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	if s.secret == "" || subtle.ConstantTimeCompare([]byte(bearer(r)), []byte(s.secret)) != 1 {
		writeError(w, 401, "unauthorized")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, 405, "method_not_allowed")
		return
	}
	var event struct {
		Type       string `json:"type"`
		NodeID     string `json:"nodeId"`
		ConsumerID string `json:"consumerId"`
		Disconnect bool   `json:"disconnect"`
		Paused     *bool  `json:"paused"`
		DailyLimit *int64 `json:"dailyLimit"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&event); err != nil {
		writeError(w, 400, "invalid_request")
		return
	}
	s.mu.Lock()
	nodes := make([]*node, 0, len(s.nodes))
	for _, n := range s.nodes {
		if event.Type == "consumer" || n.id == event.NodeID {
			nodes = append(nodes, n)
		}
	}
	s.mu.Unlock()
	for _, n := range nodes {
		if event.Type == "node" {
			if event.Disconnect {
				n.close(4001, "auth_invalid")
				continue
			}
			n.mu.Lock()
			if event.Paused != nil {
				n.paused = *event.Paused
			}
			if event.DailyLimit != nil {
				n.dailyLimit = *event.DailyLimit
			}
			n.mu.Unlock()
		} else if event.Type == "consumer" {
			n.cancelConsumer(event.ConsumerID)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// NotifyConsumer cancels in-flight requests after a platform API key is revoked.
func (s *Server) NotifyConsumer(consumerID string) {
	s.mu.Lock()
	nodes := make([]*node, 0, len(s.nodes))
	for _, n := range s.nodes {
		nodes = append(nodes, n)
	}
	s.mu.Unlock()
	for _, n := range nodes {
		n.cancelConsumer(consumerID)
	}
}

// NotifyNode applies a control-plane policy change to a live connection.
func (s *Server) NotifyNode(nodeID string, disconnect bool, paused *bool, dailyLimit *int64) {
	s.mu.Lock()
	n := s.nodes[nodeID]
	s.mu.Unlock()
	if n == nil {
		return
	}
	if disconnect {
		n.close(4001, "auth_invalid")
		return
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if paused != nil {
		n.paused = *paused
	}
	if dailyLimit != nil {
		n.dailyLimit = *dailyLimit
	}
}

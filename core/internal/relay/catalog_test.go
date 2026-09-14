package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/relaywire"
)

type catalogFixture struct {
	clock   atomic.Int64
	calls   atomic.Int64
	failure atomic.Bool
	gate    chan struct{}
	entered chan struct{}
}

func (f *catalogFixture) now() time.Time { return time.Unix(0, f.clock.Load()).UTC() }

func (f *catalogFixture) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+fixtureSecret {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	var request map[string]any
	if json.NewDecoder(r.Body).Decode(&request) != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if request["action"] == "consumer" {
		if request["consumerKey"] != "consumer-test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "unauthorized"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "consumerId": "private-consumer"})
		return
	}
	if request["action"] != "model_catalog_usage" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	f.calls.Add(1)
	if f.entered != nil {
		select {
		case f.entered <- struct{}{}:
		default:
		}
	}
	if f.gate != nil {
		select {
		case <-f.gate:
		case <-r.Context().Done():
			return
		}
	}
	if f.failure.Load() {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "temporarily_unavailable"})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true, "usageUpdatedAt": f.now().Format(time.RFC3339), "historySince": "2026-09-01T00:00:00Z",
		"models": []catalogUsage{
			{ID: "model-a", Requests24h: 3, Requests7d: 8, Activity: []catalogActivity{{Date: f.now().Format(time.DateOnly), Requests: 3}}},
			{ID: "model-b", Requests24h: 4, Requests7d: 12},
			{ID: "offline-model", Requests24h: 100, Requests7d: 700},
		},
		// Unknown/internal fields must never reach the public response.
		"nodeKey": "private-node-key", "email": "private@example.test", "upstream": "https://private.example.test",
	})
}

func setupCatalog(t *testing.T, fixture *catalogFixture) *Server {
	t.Helper()
	fixture.clock.Store(time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC).UnixNano())
	cp := httptest.NewServer(fixture)
	s, err := New(Config{ControlPlaneURL: cp.URL, Secret: fixtureSecret})
	if err != nil {
		t.Fatal(err)
	}
	s.catalog.mu.Lock()
	s.catalog.now = fixture.now
	s.catalog.mu.Unlock()
	t.Cleanup(func() {
		// These synthetic nodes have no websocket and own no running jobs.
		s.mu.Lock()
		s.nodes = make(map[string]*node)
		s.mu.Unlock()
		_ = s.Close()
		cp.Close()
	})
	return s
}

func addCatalogNode(s *Server, id string, models ...string) *node {
	n := &node{id: id, key: "private-node-key", connectionID: "private-connection", ready: true, remaining: 100, dailyLimit: 100, models: make(map[string]bool), jobs: make(map[string]*job)}
	for _, model := range models {
		n.models[model] = true
	}
	s.mu.Lock()
	s.nodes[id] = n
	s.mu.Unlock()
	return n
}

func catalogRequest(s *Server, method string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest(method, "/api/models", nil))
	return w
}

func decodeCatalog(t *testing.T, response *httptest.ResponseRecorder) catalogSnapshot {
	t.Helper()
	if response.Code != http.StatusOK {
		t.Fatalf("catalog returned %d: %s", response.Code, response.Body.String())
	}
	var snapshot catalogSnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &snapshot); err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestPublicCatalogUsesAvailableNodesAndAggregatesWithoutPrivateData(t *testing.T) {
	f := &catalogFixture{}
	s := setupCatalog(t, f)
	addCatalogNode(s, "private-node-one", "model-b", "model-a")
	addCatalogNode(s, "private-node-two", "model-c", "model-b")
	addCatalogNode(s, "empty-node")
	addCatalogNode(s, "not-ready", "offline-model").ready = false
	addCatalogNode(s, "closed", "offline-model").closed = true
	addCatalogNode(s, "paused", "offline-model").paused = true
	addCatalogNode(s, "local-paused", "offline-model").localPaused = true
	addCatalogNode(s, "exhausted", "offline-model").remaining = 0
	addCatalogNode(s, "daily-limit", "offline-model").used = 100
	busy := addCatalogNode(s, "busy", "offline-model")
	for i := 0; i < relaywire.MaxConcurrency; i++ {
		busy.jobs[string(rune('a'+i))] = &job{}
	}
	response := catalogRequest(s, http.MethodGet)
	got := decodeCatalog(t, response)
	if got.Object != "model_catalog" || got.Stale || got.RefreshAfterSeconds != 60 || got.UpdatedAt == "" || got.UsageUpdatedAt == "" || got.HistorySince == "" {
		t.Fatalf("missing catalog metadata: %+v", got)
	}
	if got.Totals != (catalogTotals{Models: 3, Nodes: 2, Requests24h: 7, Requests7d: 20}) {
		t.Fatalf("incorrect totals: %+v", got.Totals)
	}
	if len(got.Models) != 3 || got.Models[0].ID != "model-a" || got.Models[1].ID != "model-b" || got.Models[1].AvailableNodes != 2 || got.Models[2].ID != "model-c" {
		t.Fatalf("models not deduplicated/sorted: %+v", got.Models)
	}
	if got.Models[2].Requests24h != 0 || got.Models[2].Requests7d != 0 || len(got.Models[2].Activity) != 7 || got.Models[2].Activity[0].Date != "2026-09-08" {
		t.Fatalf("new model needs honest zero history: %+v", got.Models[2])
	}
	for _, private := range []string{"private-", "offline-model", "nodeKey", "consumerId", "email", "upstream", fixtureSecret} {
		if strings.Contains(response.Body.String(), private) {
			t.Fatalf("catalog leaked %q", private)
		}
	}
	if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Set-Cookie") != "" {
		t.Fatal("public catalog introduced browser cache/auth variation")
	}
	credentialed := httptest.NewRecorder()
	publicRequest := httptest.NewRequest(http.MethodGet, "/api/models", nil)
	publicRequest.Header.Set("Authorization", "Bearer invalid-consumer-key")
	publicRequest.Header.Set("Cookie", "session=private-session")
	s.ServeHTTP(credentialed, publicRequest)
	if credentialed.Code != http.StatusOK || !bytes.Equal(credentialed.Body.Bytes(), response.Body.Bytes()) {
		t.Fatal("public catalog varied by visitor credentials")
	}
	unauthenticated := httptest.NewRecorder()
	s.ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/v1/models", nil))
	if unauthenticated.Code != http.StatusUnauthorized {
		t.Fatal("public catalog weakened /v1/models authentication")
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	req.Header.Set("Authorization", "Bearer consumer-test-key")
	authenticated := httptest.NewRecorder()
	s.ServeHTTP(authenticated, req)
	if authenticated.Code != http.StatusOK || bytes.Contains(authenticated.Body.Bytes(), []byte("offline-model")) {
		t.Fatalf("authenticated model listing changed: %s", authenticated.Body.String())
	}
	head := catalogRequest(s, http.MethodHead)
	if head.Code != http.StatusOK || head.Body.Len() != 0 {
		t.Fatalf("HEAD returned a body: %+v", head)
	}
	post := catalogRequest(s, http.MethodPost)
	if post.Code != http.StatusMethodNotAllowed || post.Header().Get("Allow") != "GET, HEAD" {
		t.Fatal("catalog accepted a mutation method")
	}
	if f.calls.Load() != 1 {
		t.Fatalf("GET/HEAD unnecessarily refreshed stats %d times", f.calls.Load())
	}
}

func TestCatalogWithNoAvailableNodesHasAnHonestEmptyList(t *testing.T) {
	f := &catalogFixture{}
	s := setupCatalog(t, f)
	if f.calls.Load() != 0 {
		t.Fatal("unused catalog queried the control plane at startup")
	}
	response := catalogRequest(s, http.MethodGet)
	got := decodeCatalog(t, response)
	if got.Models == nil || len(got.Models) != 0 || got.Totals != (catalogTotals{}) {
		t.Fatalf("historical usage invented available models: %s", response.Body.String())
	}
	addCatalogNode(s, "new-node", "new-model")
	f.clock.Add(int64(61 * time.Second))
	got = decodeCatalog(t, catalogRequest(s, http.MethodGet))
	if len(got.Models) != 1 || got.Models[0].ID != "new-model" || got.Models[0].Requests24h != 0 || got.Models[0].Requests7d != 0 || len(got.Models[0].Activity) != 7 {
		t.Fatalf("new available model has fabricated history: %+v", got.Models)
	}
}

func TestCatalogSingleflightCachesUntilTTLAndSurvivesVisitorCancellation(t *testing.T) {
	f := &catalogFixture{gate: make(chan struct{}), entered: make(chan struct{}, 1)}
	s := setupCatalog(t, f)
	addCatalogNode(s, "node-one", "model-a")
	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() { _, err := s.cachedCatalog(ctx); first <- err }()
	select {
	case <-f.entered:
	case <-time.After(time.Second):
		t.Fatal("refresh never started")
	}
	const visitors = 20
	results := make(chan *httptest.ResponseRecorder, visitors)
	var callers sync.WaitGroup
	for i := 0; i < visitors; i++ {
		callers.Add(1)
		go func() { defer callers.Done(); results <- catalogRequest(s, http.MethodGet) }()
	}
	cancel()
	if err := <-first; err != context.Canceled {
		t.Fatalf("cancelled visitor returned %v", err)
	}
	close(f.gate)
	callers.Wait()
	close(results)
	for result := range results {
		decodeCatalog(t, result)
	}
	if f.calls.Load() != 1 {
		t.Fatalf("concurrent visitors caused %d refreshes", f.calls.Load())
	}
	addCatalogNode(s, "node-two", "model-c")
	cached := decodeCatalog(t, catalogRequest(s, http.MethodGet))
	if len(cached.Models) != 1 {
		t.Fatal("cached catalog changed before the refresh interval")
	}
	f.clock.Add(int64(61 * time.Second))
	refreshed := decodeCatalog(t, catalogRequest(s, http.MethodGet))
	if len(refreshed.Models) != 2 || refreshed.UpdatedAt == cached.UpdatedAt || f.calls.Load() != 2 {
		t.Fatal("expired catalog did not refresh once")
	}
}

func TestCatalogRefreshFailureHasBoundedStaleFallbackAndRecovery(t *testing.T) {
	f := &catalogFixture{}
	f.failure.Store(true)
	s := setupCatalog(t, f)
	addCatalogNode(s, "node-one", "model-a")
	initial := catalogRequest(s, http.MethodGet)
	if initial.Code != http.StatusServiceUnavailable || !strings.Contains(initial.Body.String(), "catalog_unavailable") || strings.Contains(initial.Body.String(), "\"models\":") {
		t.Fatal("initial failure must not masquerade as an empty catalog")
	}
	if catalogRequest(s, http.MethodGet).Code != http.StatusServiceUnavailable || f.calls.Load() != 1 {
		t.Fatal("failed initial refresh was retried on every visitor")
	}
	f.failure.Store(false)
	f.clock.Add(int64(61 * time.Second))
	good := decodeCatalog(t, catalogRequest(s, http.MethodGet))
	f.failure.Store(true)
	f.clock.Add(int64(61 * time.Second))
	stale := decodeCatalog(t, catalogRequest(s, http.MethodGet))
	if !stale.Stale || stale.UpdatedAt != good.UpdatedAt || !reflect.DeepEqual(stale.Models, good.Models) {
		t.Fatal("failed refresh lost its last good snapshot or claimed fresh data")
	}
	decodeCatalog(t, catalogRequest(s, http.MethodGet))
	if f.calls.Load() != 3 {
		t.Fatal("failed refresh was retried on every visitor")
	}
	f.clock.Add(int64(4 * time.Minute))
	expired := catalogRequest(s, http.MethodGet)
	if expired.Code != http.StatusServiceUnavailable {
		t.Fatalf("snapshot older than five minutes still served: %s", expired.Body.String())
	}
	head := catalogRequest(s, http.MethodHead)
	if head.Code != http.StatusServiceUnavailable || head.Body.Len() != 0 || head.Header().Get("Retry-After") != "60" {
		t.Fatal("HEAD failure returned unexpected content")
	}
	f.failure.Store(false)
	f.clock.Add(int64(61 * time.Second))
	recovered := decodeCatalog(t, catalogRequest(s, http.MethodGet))
	if recovered.Stale || recovered.UpdatedAt == good.UpdatedAt {
		t.Fatal("recovered catalog remained stale")
	}
}

func TestCatalogShutdownCancelsPendingRefresh(t *testing.T) {
	f := &catalogFixture{gate: make(chan struct{}), entered: make(chan struct{}, 1)}
	s := setupCatalog(t, f)
	result := make(chan *httptest.ResponseRecorder, 1)
	go func() { result <- catalogRequest(s, http.MethodGet) }()
	select {
	case <-f.entered:
	case <-time.After(time.Second):
		t.Fatal("refresh never started")
	}
	closed := make(chan struct{})
	go func() { _ = s.Close(); close(closed) }()
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("catalog refresh prevented shutdown")
	}
	response := <-result
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("shutdown response: %d", response.Code)
	}
	if catalogRequest(s, http.MethodGet).Code != http.StatusServiceUnavailable {
		t.Fatal("closed server accepted a catalog request")
	}
}

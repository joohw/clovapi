package relay

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"sync"
	"time"
)

const (
	catalogRefreshInterval = time.Minute
	catalogMaxAge          = 5 * time.Minute
)

var errCatalogUnavailable = errors.New("model catalog unavailable")

type CatalogActivity struct {
	Date     string `json:"date"`
	Requests int64  `json:"requests"`
}

type CatalogUsage struct {
	ID          string            `json:"id"`
	Requests24h int64             `json:"requests24h"`
	Requests7d  int64             `json:"requests7d"`
	Activity    []CatalogActivity `json:"activity"`
}

type catalogActivity = CatalogActivity
type catalogUsage = CatalogUsage

type catalogModel struct {
	ID             string            `json:"id"`
	AvailableNodes int               `json:"availableNodes"`
	Requests24h    int64             `json:"requests24h"`
	Requests7d     int64             `json:"requests7d"`
	Activity       []catalogActivity `json:"activity"`
}

type catalogTotals struct {
	Models      int   `json:"models"`
	Nodes       int   `json:"nodes"`
	Requests24h int64 `json:"requests24h"`
	Requests7d  int64 `json:"requests7d"`
}

type catalogSnapshot struct {
	Object              string         `json:"object"`
	UpdatedAt           string         `json:"updatedAt"`
	UsageUpdatedAt      string         `json:"usageUpdatedAt"`
	HistorySince        string         `json:"historySince"`
	RefreshAfterSeconds int            `json:"refreshAfterSeconds"`
	Stale               bool           `json:"stale"`
	Models              []catalogModel `json:"models"`
	Totals              catalogTotals  `json:"totals"`
}

type catalogCache struct {
	mu          sync.Mutex
	now         func() time.Time
	requested   bool
	snapshot    *catalogSnapshot
	updatedAt   time.Time
	nextAttempt time.Time
	inFlight    chan struct{}
}

func (s *Server) modelCatalog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	snapshot, err := s.cachedCatalog(r.Context())
	if err != nil {
		w.Header().Set("Retry-After", "60")
		if r.Method == http.MethodHead {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		writeError(w, http.StatusServiceUnavailable, "catalog_unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	_ = json.NewEncoder(w).Encode(snapshot)
}

func (s *Server) cachedCatalog(ctx context.Context) (catalogSnapshot, error) {
	s.mu.Lock()
	closed := s.closed
	s.mu.Unlock()
	if closed {
		return catalogSnapshot{}, errCatalogUnavailable
	}
	c := &s.catalog
	for {
		c.mu.Lock()
		c.requested = true
		now := c.now()
		if c.snapshot != nil && now.Sub(c.updatedAt) < catalogRefreshInterval {
			result := *c.snapshot
			c.mu.Unlock()
			return result, nil
		}
		if c.inFlight == nil && now.Before(c.nextAttempt) {
			result, err := c.staleSnapshot(now)
			c.mu.Unlock()
			return result, err
		}
		if c.inFlight == nil {
			c.inFlight = make(chan struct{})
			s.catalogWake <- struct{}{}
		}
		done := c.inFlight
		c.mu.Unlock()
		select {
		case <-done:
		case <-ctx.Done():
			return catalogSnapshot{}, ctx.Err()
		case <-s.ctx.Done():
			return catalogSnapshot{}, errCatalogUnavailable
		}
	}
}

// staleSnapshot is called with the cache mutex held. Published snapshots are
// immutable: changing Stale on this value never changes the shared cache.
func (c *catalogCache) staleSnapshot(now time.Time) (catalogSnapshot, error) {
	if c.snapshot == nil || now.Sub(c.updatedAt) >= catalogMaxAge {
		return catalogSnapshot{}, errCatalogUnavailable
	}
	result := *c.snapshot
	result.Stale = true
	return result, nil
}

// One lifecycle-owned worker provides singleflight refreshes for every visitor.
// A disconnected visitor cannot cancel the refresh other visitors are awaiting.
func (s *Server) catalogWorker() {
	defer s.wg.Done()
	tick := time.NewTicker(catalogRefreshInterval)
	defer tick.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-s.catalogWake:
			s.refreshCatalog()
			tick.Reset(catalogRefreshInterval)
		case <-tick.C:
			c := &s.catalog
			c.mu.Lock()
			due := c.requested && c.inFlight == nil && !c.now().Before(c.nextAttempt)
			if due {
				c.inFlight = make(chan struct{})
			}
			c.mu.Unlock()
			if due {
				s.refreshCatalog()
				tick.Reset(catalogRefreshInterval)
			}
		}
	}
}

func (s *Server) refreshCatalog() {
	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	snapshot, err := s.buildCatalog(ctx)
	c := &s.catalog
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	c.nextAttempt = now.Add(catalogRefreshInterval)
	if err == nil {
		snapshot.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
		c.snapshot = &snapshot
		c.updatedAt = now
	}
	close(c.inFlight)
	c.inFlight = nil
}

func (s *Server) buildCatalog(ctx context.Context) (catalogSnapshot, error) {
	usage, err := s.control(ctx, "model_catalog_usage", map[string]any{})
	if err != nil {
		return catalogSnapshot{}, err
	}
	usageTime, err := time.Parse(time.RFC3339Nano, usage.UsageUpdatedAt)
	if err != nil || usage.CatalogModels == nil {
		return catalogSnapshot{}, errCatalogUnavailable
	}
	if _, err := time.Parse(time.RFC3339Nano, usage.HistorySince); err != nil {
		return catalogSnapshot{}, errCatalogUnavailable
	}
	byID := make(map[string]catalogUsage, len(usage.CatalogModels))
	for _, model := range usage.CatalogModels {
		byID[model.ID] = model
	}
	// Never hold node locks while asking the control plane for usage metadata.
	s.mu.Lock()
	nodes := make([]*node, 0, len(s.nodes))
	for _, n := range s.nodes {
		nodes = append(nodes, n)
	}
	s.mu.Unlock()
	counts := make(map[string]int)
	nodeCount := 0
	for _, n := range nodes {
		n.mu.Lock()
		if n.available("") && len(n.models) > 0 {
			nodeCount++
			for id := range n.models {
				counts[id]++
			}
		}
		n.mu.Unlock()
	}
	ids := make([]string, 0, len(counts))
	for id := range counts {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	snapshot := catalogSnapshot{
		Object: "model_catalog", UsageUpdatedAt: usage.UsageUpdatedAt, HistorySince: usage.HistorySince,
		RefreshAfterSeconds: int(catalogRefreshInterval / time.Second), Models: make([]catalogModel, 0, len(ids)),
		Totals: catalogTotals{Models: len(ids), Nodes: nodeCount},
	}
	for _, id := range ids {
		stats := byID[id]
		if stats.Requests24h < 0 || stats.Requests7d < 0 {
			return catalogSnapshot{}, errCatalogUnavailable
		}
		activity := stats.Activity
		if len(activity) == 0 {
			activity = make([]catalogActivity, 7)
			for day := range activity {
				activity[day].Date = usageTime.UTC().AddDate(0, 0, day-6).Format(time.DateOnly)
			}
		}
		snapshot.Models = append(snapshot.Models, catalogModel{ID: id, AvailableNodes: counts[id], Requests24h: stats.Requests24h, Requests7d: stats.Requests7d, Activity: activity})
		snapshot.Totals.Requests24h += stats.Requests24h
		snapshot.Totals.Requests7d += stats.Requests7d
	}
	return snapshot, nil
}

package proxy

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
	"github.com/clovapi/switcher/internal/usage"
)

const defaultUsagePollInterval = 2 * time.Minute
const preferredRouteUsageThreshold = 90.0

type UsageSnapshot struct {
	OK         bool         `json:"ok"`
	Vendor     string       `json:"vendor"`
	VendorKind string       `json:"vendorKind,omitempty"`
	ProviderID string       `json:"providerId,omitempty"`
	SourceType string       `json:"sourceType,omitempty"`
	SourceID   string       `json:"sourceId,omitempty"`
	CacheKey   string       `json:"cacheKey,omitempty"`
	Template   string       `json:"templateType,omitempty"`
	Text       string       `json:"text,omitempty"`
	Usage      usage.Result `json:"usage,omitempty"`
	Error      string       `json:"error,omitempty"`
	UpdatedAt  string       `json:"updatedAt,omitempty"`
}

type UsagePollerSnapshot struct {
	OK        bool            `json:"ok"`
	Usages    []UsageSnapshot `json:"usages"`
	UpdatedAt string          `json:"updatedAt,omitempty"`
	Polling   bool            `json:"polling,omitempty"`
	Error     string          `json:"error,omitempty"`
}

type UsagePoller struct {
	server   *Server
	interval time.Duration

	mu        sync.Mutex
	usages    map[string]UsageSnapshot
	updatedAt time.Time
	polling   bool
	lastError string
	stopCh    chan struct{}
	doneCh    chan struct{}
	started   bool
}

func NewUsagePoller(server *Server) *UsagePoller {
	return &UsagePoller{
		server:   server,
		interval: defaultUsagePollInterval,
		usages:   map[string]UsageSnapshot{},
		stopCh:   make(chan struct{}),
		doneCh:   make(chan struct{}),
	}
}

func (p *UsagePoller) Start() {
	p.mu.Lock()
	if p.started {
		p.mu.Unlock()
		return
	}
	p.started = true
	stopCh := p.stopCh
	doneCh := p.doneCh
	p.mu.Unlock()

	go func() {
		defer close(doneCh)
		p.Refresh(context.Background())
		ticker := time.NewTicker(p.interval)
		defer ticker.Stop()
		for {
			select {
			case <-stopCh:
				return
			case <-ticker.C:
				p.Refresh(context.Background())
			}
		}
	}()
}

func (p *UsagePoller) Stop() {
	p.mu.Lock()
	if !p.started {
		p.mu.Unlock()
		return
	}
	stopCh := p.stopCh
	doneCh := p.doneCh
	p.started = false
	p.stopCh = make(chan struct{})
	p.doneCh = make(chan struct{})
	p.mu.Unlock()

	close(stopCh)
	select {
	case <-doneCh:
	case <-time.After(2 * time.Second):
	}
}

func (p *UsagePoller) RefreshIfStaleAsync() {
	p.mu.Lock()
	stale := p.updatedAt.IsZero() || time.Since(p.updatedAt) >= p.interval
	polling := p.polling
	p.mu.Unlock()
	if !stale || polling {
		return
	}
	go func() { _ = p.Refresh(context.Background()) }()
}

func (p *UsagePoller) Refresh(ctx context.Context) error {
	p.mu.Lock()
	if p.polling {
		p.mu.Unlock()
		return nil
	}
	p.polling = true
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		p.polling = false
		p.mu.Unlock()
	}()

	store, err := p.server.loadStore()
	if err != nil {
		p.setError(err.Error())
		return err
	}
	snapshots := queryStoreUsage(ctx, store)
	now := time.Now().UTC()

	p.mu.Lock()
	nextUsages := map[string]UsageSnapshot{}
	for _, snapshot := range snapshots {
		snapshot.UpdatedAt = now.Format(time.RFC3339)
		key := usageSnapshotKey(snapshot.SourceType, snapshot.SourceID, snapshot.ProviderID, snapshot.CacheKey)
		if !snapshot.OK {
			if previous, ok := p.usages[key]; ok && previous.OK {
				nextUsages[key] = previous
				continue
			}
		}
		nextUsages[key] = snapshot
	}
	p.usages = nextUsages
	p.updatedAt = now
	p.lastError = ""
	p.mu.Unlock()
	return nil
}

func (p *UsagePoller) setError(message string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastError = strings.TrimSpace(message)
}

func (p *UsagePoller) Snapshot() UsagePollerSnapshot {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]UsageSnapshot, 0, len(p.usages))
	for _, snapshot := range p.usages {
		out = append(out, snapshot)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Vendor) < strings.ToLower(out[j].Vendor)
	})
	updatedAt := ""
	if !p.updatedAt.IsZero() {
		updatedAt = p.updatedAt.Format(time.RFC3339)
	}
	return UsagePollerSnapshot{
		OK:        p.lastError == "",
		Usages:    out,
		UpdatedAt: updatedAt,
		Polling:   p.polling,
		Error:     p.lastError,
	}
}

func queryStoreUsage(ctx context.Context, store *profile.Store) []UsageSnapshot {
	if store == nil {
		return nil
	}
	out := make([]UsageSnapshot, 0)
	explicitSubscriptionProviders := map[string]bool{}
	for _, account := range store.Subscriptions {
		providerID := strings.TrimSpace(account.ProviderID)
		if providerID != "" {
			explicitSubscriptionProviders[providerID] = true
		}
	}
	for _, vendor := range store.List {
		select {
		case <-ctx.Done():
			return out
		default:
		}
		if strings.HasPrefix(strings.TrimSpace(vendor.Name), "__") {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(vendor.Kind), "subscription") &&
			explicitSubscriptionProviders[strings.TrimSpace(vendor.SubscriptionProviderID)] {
			continue
		}
		snapshot, ok := queryProfileUsage(vendor)
		if ok {
			out = append(out, snapshot)
		}
	}
	for _, account := range store.Subscriptions {
		select {
		case <-ctx.Done():
			return out
		default:
		}
		snapshot, ok := querySubscriptionAccountUsage(account)
		if ok {
			out = append(out, snapshot)
		}
	}
	return out
}

func queryProfileUsage(vendor profile.Profile) (UsageSnapshot, bool) {
	kind := strings.ToLower(strings.TrimSpace(vendor.Kind))
	providerID := profile.ProviderIDFromStoreProfile(vendor)
	switch {
	case kind == "subscription" || strings.TrimSpace(vendor.SubscriptionProviderID) != "":
		result := querySubscriptionUsage(vendor)
		sourceID := defaultSubscriptionSourceID(vendor.SubscriptionProviderID, vendor.Name)
		return UsageSnapshot{
			OK:         result.Success,
			Vendor:     strings.TrimSpace(vendor.Name),
			VendorKind: "subscription",
			ProviderID: providerID,
			SourceType: "subscription",
			SourceID:   sourceID,
			CacheKey:   strings.TrimSpace(vendor.Name),
			Template:   "subscription",
			Text:       strings.TrimSpace(result.Text),
			Usage:      result,
			Error:      result.Error,
		}, true
	case kind == "api":
		baseURL, apiKey, templateType, ok := resolveUsageCredentials(vendor)
		if !ok {
			return UsageSnapshot{}, false
		}
		result := usage.QueryVendorUsage(baseURL, apiKey, templateType)
		return UsageSnapshot{
			OK:         result.Success,
			Vendor:     strings.TrimSpace(vendor.Name),
			VendorKind: "api",
			ProviderID: providerID,
			SourceType: "api",
			SourceID:   strings.TrimSpace(vendor.Name),
			CacheKey:   strings.TrimSpace(vendor.Name),
			Template:   templateType,
			Text:       strings.TrimSpace(result.Text),
			Usage:      result,
			Error:      result.Error,
		}, true
	default:
		return UsageSnapshot{}, false
	}
}

func querySubscriptionAccountUsage(account profile.SubscriptionAccount) (UsageSnapshot, bool) {
	providerID := strings.TrimSpace(account.ProviderID)
	sourceID := strings.TrimSpace(account.ID)
	if providerID == "" || sourceID == "" {
		return UsageSnapshot{}, false
	}
	flat := profile.Profile{
		Name:                   strings.TrimSpace(account.Label),
		Kind:                   "subscription",
		SubscriptionProviderID: providerID,
	}
	profile.HydrateSubscriptionAccountCredentials(&flat, account)
	result := usage.QuerySubscriptionUsage(providerID, flat.APIKey, flat.AccountID)
	label := strings.TrimSpace(account.Label)
	if label == "" {
		label = sourceID
	}
	return UsageSnapshot{
		OK:         result.Success,
		Vendor:     label,
		VendorKind: "subscription",
		ProviderID: providerID,
		SourceType: "subscription",
		SourceID:   sourceID,
		CacheKey:   "subscription:" + sourceID,
		Template:   "subscription",
		Text:       strings.TrimSpace(result.Text),
		Usage:      result,
		Error:      result.Error,
	}, true
}

func defaultSubscriptionSourceID(providerID, fallback string) string {
	switch strings.TrimSpace(providerID) {
	case provider.CodexProviderID:
		return profile.DefaultCodexSubscriptionAccountID
	case provider.ClaudeCodeProviderID:
		return profile.DefaultClaudeSubscriptionAccountID
	default:
		return strings.TrimSpace(fallback)
	}
}

func usageSnapshotKey(sourceType, sourceID, providerID, fallback string) string {
	parts := []string{
		strings.ToLower(strings.TrimSpace(sourceType)),
		strings.ToLower(strings.TrimSpace(sourceID)),
		strings.ToLower(strings.TrimSpace(providerID)),
	}
	if parts[0] != "" && parts[1] != "" {
		return strings.Join(parts, "\x00")
	}
	return strings.ToLower(strings.TrimSpace(fallback))
}

type routeUsageState struct {
	known       bool
	utilization float64
	exhausted   bool
}

// OrderRoutes preserves configured order while usage is at or below the
// threshold. When every usable route is above the threshold, the least-used
// route is first. Exhausted routes are omitted.
func (p *UsagePoller) OrderRoutes(routes []proxyresolve.ForwardRoute) []proxyresolve.ForwardRoute {
	if p == nil || len(routes) == 0 {
		return routes
	}
	p.RefreshIfStaleAsync()
	p.mu.Lock()
	snapshots := make(map[string]UsageSnapshot, len(p.usages))
	for key, snapshot := range p.usages {
		snapshots[key] = snapshot
	}
	p.mu.Unlock()
	type scoredRoute struct {
		route proxyresolve.ForwardRoute
		usage float64
	}
	preferred := make([]proxyresolve.ForwardRoute, 0, len(routes))
	unknown := make([]proxyresolve.ForwardRoute, 0, len(routes))
	highUsage := make([]scoredRoute, 0, len(routes))
	for _, route := range routes {
		key := usageSnapshotKey(route.SourceType, route.SourceID, route.ProviderID, "")
		state := usageStateFromSnapshot(snapshots[key])
		if state.exhausted {
			continue
		}
		if !state.known {
			unknown = append(unknown, route)
			continue
		}
		if state.utilization <= preferredRouteUsageThreshold {
			preferred = append(preferred, route)
			continue
		}
		highUsage = append(highUsage, scoredRoute{route: route, usage: state.utilization})
	}
	sort.SliceStable(highUsage, func(i, j int) bool { return highUsage[i].usage < highUsage[j].usage })
	out := make([]proxyresolve.ForwardRoute, 0, len(preferred)+len(unknown)+len(highUsage))
	out = append(out, preferred...)
	out = append(out, unknown...)
	for _, candidate := range highUsage {
		out = append(out, candidate.route)
	}
	return out
}

func usageStateFromSnapshot(snapshot UsageSnapshot) routeUsageState {
	if !snapshot.OK || !snapshot.Usage.Success {
		return routeUsageState{}
	}
	state := routeUsageState{}
	for _, tier := range snapshot.Usage.Tiers {
		state.known = true
		if tier.Utilization > state.utilization {
			state.utilization = tier.Utilization
		}
	}
	for _, row := range snapshot.Usage.Data {
		if row.IsValid != nil && !*row.IsValid {
			state.known = true
			state.exhausted = true
			state.utilization = 100
			continue
		}
		var value float64
		var ok bool
		if row.Total != nil && *row.Total > 0 && row.Used != nil {
			value, ok = (*row.Used / *row.Total)*100, true
		} else if strings.TrimSpace(row.Unit) == "%" && row.Used != nil {
			value, ok = *row.Used, true
		}
		if ok {
			state.known = true
			if value > state.utilization {
				state.utilization = value
			}
		}
		if row.Remaining != nil && *row.Remaining <= 0 {
			state.known = true
			state.exhausted = true
		}
	}
	if state.utilization >= 100 {
		state.exhausted = true
	}
	return state
}

func querySubscriptionUsage(vendor profile.Profile) usage.Result {
	flat := vendor
	profile.HydrateSubscriptionCredentials(&flat)
	if strings.TrimSpace(flat.APIKey) == "" {
		return usage.Result{Success: false, Kind: "subscription", Error: "subscription not logged in"}
	}
	return usage.QuerySubscriptionUsage(flat.SubscriptionProviderID, flat.APIKey, flat.AccountID)
}

func resolveUsageCredentials(vendor profile.Profile) (baseURL, apiKey, templateType string, ok bool) {
	baseURL = strings.TrimSpace(vendor.BaseURL)
	apiKey = strings.TrimSpace(vendor.APIKey)
	if baseURL == "" || apiKey == "" {
		for _, model := range vendor.Models {
			modelBaseURL := strings.TrimSpace(model.BaseURL)
			modelAPIKey := strings.TrimSpace(model.APIKey)
			if modelBaseURL != "" && modelAPIKey != "" {
				baseURL = modelBaseURL
				apiKey = modelAPIKey
				break
			}
		}
	}
	if baseURL == "" || apiKey == "" {
		return "", "", "", false
	}
	templateType = usage.TemplateAuto
	if vendor.UsageQuery != nil {
		if !vendor.UsageQuery.Enabled {
			return "", "", "", false
		}
		if t := strings.TrimSpace(vendor.UsageQuery.TemplateType); t != "" {
			templateType = t
		}
	}
	if profile.ProviderIDFromStoreProfile(vendor) == provider.OllamaProviderID {
		return "", "", "", false
	}
	return baseURL, apiKey, templateType, true
}

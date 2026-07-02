package proxy

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/usage"
)

const defaultUsagePollInterval = 5 * time.Minute

type UsageSnapshot struct {
	OK         bool         `json:"ok"`
	Vendor     string       `json:"vendor"`
	VendorKind string       `json:"vendorKind,omitempty"`
	ProviderID string       `json:"providerId,omitempty"`
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
	p.usages = map[string]UsageSnapshot{}
	for _, snapshot := range snapshots {
		snapshot.UpdatedAt = now.Format(time.RFC3339)
		p.usages[strings.ToLower(strings.TrimSpace(snapshot.Vendor))] = snapshot
	}
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
	for _, vendor := range store.List {
		select {
		case <-ctx.Done():
			return out
		default:
		}
		if strings.HasPrefix(strings.TrimSpace(vendor.Name), "__") {
			continue
		}
		snapshot, ok := queryProfileUsage(vendor)
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
		return UsageSnapshot{
			OK:         result.Success,
			Vendor:     strings.TrimSpace(vendor.Name),
			VendorKind: "subscription",
			ProviderID: providerID,
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
			Template:   templateType,
			Text:       strings.TrimSpace(result.Text),
			Usage:      result,
			Error:      result.Error,
		}, true
	default:
		return UsageSnapshot{}, false
	}
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

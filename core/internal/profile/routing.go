package profile

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/provider"
)

const (
	DefaultCodexSubscriptionAccountID  = "codex-default"
	DefaultClaudeSubscriptionAccountID = "claude-default"
)

// DerivedRouteBackend is a non-secret, callable backend view derived from the
// current profile store. It is intentionally read-only in the first smart
// routing phase.
type DerivedRouteBackend struct {
	ID            string         `json:"id"`
	SourceType    string         `json:"source_type"`
	SourceID      string         `json:"source_id,omitempty"`
	SourceLabel   string         `json:"source_label,omitempty"`
	ProviderID    string         `json:"provider_id"`
	ModelID       string         `json:"model_id"`
	UpstreamModel string         `json:"upstream_model"`
	APIStyle      apistyle.Style `json:"api_style"`
	Enabled       bool           `json:"enabled"`
	Priority      int            `json:"priority"`
	Weight        int            `json:"weight"`
}

func defaultSubscriptionAccount(providerID string) (SubscriptionAccount, bool) {
	switch strings.TrimSpace(providerID) {
	case provider.CodexProviderID:
		return SubscriptionAccount{
			ID:            DefaultCodexSubscriptionAccountID,
			ProviderID:    provider.CodexProviderID,
			Label:         provider.CodexVendorName,
			CredentialRef: "subscription/codex.json",
			Status:        "unknown",
		}, true
	case provider.ClaudeCodeProviderID:
		return SubscriptionAccount{
			ID:            DefaultClaudeSubscriptionAccountID,
			ProviderID:    provider.ClaudeCodeProviderID,
			Label:         provider.ClaudeCodeVendorName,
			CredentialRef: "subscription/claude.json",
			Status:        "unknown",
		}, true
	default:
		return SubscriptionAccount{}, false
	}
}

func normalizeSubscriptionAccount(raw SubscriptionAccount) SubscriptionAccount {
	id := strings.TrimSpace(raw.ID)
	providerID := strings.TrimSpace(raw.ProviderID)
	if id == "" {
		id = strings.TrimSpace(providerID)
	}
	label := strings.TrimSpace(raw.Label)
	if label == "" {
		label = id
	}
	status := strings.TrimSpace(raw.Status)
	if status == "" {
		status = "unknown"
	}
	models := normalizeVendorModels(raw.Models)
	return SubscriptionAccount{
		ID:            id,
		ProviderID:    providerID,
		Label:         label,
		CredentialRef: strings.TrimSpace(raw.CredentialRef),
		Status:        status,
		Plan:          strings.TrimSpace(raw.Plan),
		Models:        models,
		CreatedAt:     strings.TrimSpace(raw.CreatedAt),
		UpdatedAt:     strings.TrimSpace(raw.UpdatedAt),
	}
}

// EnsureDefaultSubscriptionAccounts adds compatibility account records for
// existing single-account subscription vendor profiles.
func EnsureDefaultSubscriptionAccounts(s *Store) bool {
	if s == nil {
		return false
	}
	changed := false
	providerHasModels := map[string]bool{}
	for _, p := range s.List {
		if !strings.EqualFold(strings.TrimSpace(p.Kind), "subscription") {
			continue
		}
		providerID := strings.TrimSpace(p.SubscriptionProviderID)
		if providerID != "" && hasRealSubscriptionModels(p.Models) {
			providerHasModels[providerID] = true
		}
	}
	seen := map[string]struct{}{}
	seenProvider := map[string]struct{}{}
	out := make([]SubscriptionAccount, 0, len(s.Subscriptions)+2)
	for _, raw := range s.Subscriptions {
		acc := normalizeSubscriptionAccount(raw)
		if acc.ID == "" || acc.ProviderID == "" {
			changed = true
			continue
		}
		key := strings.ToLower(acc.ID)
		if isDefaultCompatibilitySubscriptionAccount(acc) && !providerHasModels[acc.ProviderID] {
			changed = true
			continue
		}
		if _, ok := seen[key]; ok {
			changed = true
			continue
		}
		seen[key] = struct{}{}
		seenProvider[strings.TrimSpace(acc.ProviderID)] = struct{}{}
		out = append(out, acc)
		if !reflect.DeepEqual(acc, raw) {
			changed = true
		}
	}
	for _, p := range s.List {
		if !strings.EqualFold(strings.TrimSpace(p.Kind), "subscription") {
			continue
		}
		providerID := strings.TrimSpace(p.SubscriptionProviderID)
		if _, exists := seenProvider[providerID]; exists {
			continue
		}
		if !providerHasModels[providerID] {
			continue
		}
		acc, ok := defaultSubscriptionAccount(providerID)
		if !ok {
			continue
		}
		key := strings.ToLower(acc.ID)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		seenProvider[providerID] = struct{}{}
		out = append(out, acc)
		changed = true
	}
	if changed {
		s.Subscriptions = out
	}
	return changed
}

func isDefaultCompatibilitySubscriptionAccount(acc SubscriptionAccount) bool {
	switch strings.TrimSpace(acc.ProviderID) {
	case provider.CodexProviderID:
		return strings.TrimSpace(acc.ID) == DefaultCodexSubscriptionAccountID
	case provider.ClaudeCodeProviderID:
		return strings.TrimSpace(acc.ID) == DefaultClaudeSubscriptionAccountID
	default:
		return false
	}
}

func hasRealSubscriptionModels(models []Model) bool {
	for _, raw := range models {
		id := strings.ToLower(strings.TrimSpace(raw.ID))
		model := strings.ToLower(strings.TrimSpace(raw.Model))
		if model == "" || id == "default" || model == "default" {
			continue
		}
		return true
	}
	return false
}

func routeBackendPreference(s *Store, id string) (enabled bool, priority int, weight int) {
	enabled = true
	priority = 100
	weight = 1
	if s == nil {
		return enabled, priority, weight
	}
	key := strings.TrimSpace(id)
	for _, pref := range s.RouteBackends {
		if strings.TrimSpace(pref.ID) != key {
			continue
		}
		if pref.Enabled != nil {
			enabled = *pref.Enabled
		}
		if pref.Priority != 0 {
			priority = pref.Priority
		}
		if pref.Weight > 0 {
			weight = pref.Weight
		}
		return enabled, priority, weight
	}
	return enabled, priority, weight
}

func DerivedRouteBackendID(sourceType, sourceID, providerID, modelID string) string {
	parts := []string{sourceType, sourceID, providerID, modelID}
	for i := range parts {
		parts[i] = strings.ToLower(strings.TrimSpace(parts[i]))
		parts[i] = strings.NewReplacer(" ", "-", "/", "-", ":", "-", "_", "-").Replace(parts[i])
	}
	return strings.Join(parts, "__")
}

// DerivedRouteBackends returns non-secret routing candidates derived from the
// current store. It does not change runtime proxy behavior by itself.
func (s *Store) DerivedRouteBackends() []DerivedRouteBackend {
	if s == nil {
		return nil
	}
	subscriptionProviders := s.explicitSubscriptionProviders()
	var out []DerivedRouteBackend
	for _, vendor := range s.List {
		providerID := ProviderIDFromStoreProfile(vendor)
		if providerID == "" {
			continue
		}
		sourceType := strings.ToLower(strings.TrimSpace(vendor.Kind))
		if sourceType == "" {
			sourceType = "api"
		}
		if sourceType == "subscription" && subscriptionProviders[providerID] {
			continue
		}
		sourceID := strings.TrimSpace(vendor.Name)
		sourceLabel := strings.TrimSpace(vendor.Name)
		if sourceType == "subscription" {
			if acc, ok := defaultSubscriptionAccount(vendor.SubscriptionProviderID); ok {
				sourceID = acc.ID
				sourceLabel = acc.Label
			}
		}
		for i, raw := range vendor.Models {
			model := NormalizeModelEntry(raw, i)
			id := DerivedRouteBackendID(sourceType, sourceID, providerID, model.ID)
			enabled, priority, weight := routeBackendPreference(s, id)
			out = append(out, DerivedRouteBackend{
				ID:            id,
				SourceType:    sourceType,
				SourceID:      sourceID,
				SourceLabel:   sourceLabel,
				ProviderID:    providerID,
				ModelID:       model.ID,
				UpstreamModel: model.Model,
				APIStyle:      firstStyle(model.APIStyle, vendor.APIStyle),
				Enabled:       enabled,
				Priority:      priority,
				Weight:        weight,
			})
		}
	}
	for _, raw := range s.Subscriptions {
		acc := normalizeSubscriptionAccount(raw)
		if acc.ID == "" || acc.ProviderID == "" {
			continue
		}
		for i, rawModel := range acc.Models {
			model := NormalizeModelEntry(rawModel, i)
			id := DerivedRouteBackendID("subscription", acc.ID, acc.ProviderID, model.ID)
			enabled, priority, weight := routeBackendPreference(s, id)
			out = append(out, DerivedRouteBackend{
				ID:            id,
				SourceType:    "subscription",
				SourceID:      acc.ID,
				SourceLabel:   acc.Label,
				ProviderID:    acc.ProviderID,
				ModelID:       model.ID,
				UpstreamModel: model.Model,
				APIStyle:      firstStyle(model.APIStyle, subscriptionAPIStyleForProvider(acc.ProviderID)),
				Enabled:       enabled,
				Priority:      priority,
				Weight:        weight,
			})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].ProviderID != out[j].ProviderID {
			return out[i].ProviderID < out[j].ProviderID
		}
		if out[i].ModelID != out[j].ModelID {
			return out[i].ModelID < out[j].ModelID
		}
		if out[i].Priority != out[j].Priority {
			return out[i].Priority < out[j].Priority
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func (s *Store) explicitSubscriptionProviders() map[string]bool {
	out := map[string]bool{}
	if s == nil {
		return out
	}
	for _, raw := range s.Subscriptions {
		acc := normalizeSubscriptionAccount(raw)
		if acc.ID != "" && acc.ProviderID != "" {
			out[acc.ProviderID] = true
		}
	}
	return out
}

func subscriptionAPIStyleForProvider(providerID string) apistyle.Style {
	if strings.TrimSpace(providerID) == provider.CodexProviderID {
		return apistyle.OpenAIResponses
	}
	return apistyle.Claude
}

func (b DerivedRouteBackend) String() string {
	return fmt.Sprintf("%s/%s -> %s", b.ProviderID, b.ModelID, b.ID)
}

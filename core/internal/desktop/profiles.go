package desktop

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	cfgpkg "github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
)

func boolPtr(v bool) *bool {
	return &v
}

type UIModel struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Model    string `json:"model"`
	APIStyle string `json:"apiStyle"`
	BaseURL  string `json:"baseUrl,omitempty"`
	APIKey   string `json:"apiKey,omitempty"`
}

type UIVendor struct {
	Name                   string        `json:"name"`
	Kind                   string        `json:"kind"`
	LocalProvider          string        `json:"localProvider,omitempty"`
	SubscriptionProviderID string        `json:"subscriptionProviderId,omitempty"`
	ModelAdapter           string        `json:"modelAdapter"`
	BaseURL                string        `json:"baseUrl,omitempty"`
	APIKey                 string        `json:"apiKey,omitempty"`
	UsageQuery             *UsageQueryUI `json:"usageQuery,omitempty"`
	Usage                  any           `json:"usage,omitempty"`
	Models                 []UIModel     `json:"models"`
}

type UISubscriptionAccount struct {
	ID            string    `json:"id"`
	ProviderID    string    `json:"providerId"`
	Label         string    `json:"label"`
	CredentialRef string    `json:"credentialRef"`
	Status        string    `json:"status,omitempty"`
	Plan          string    `json:"plan,omitempty"`
	Models        []UIModel `json:"models,omitempty"`
}

type UIRouteBackend struct {
	ID            string `json:"id"`
	SourceType    string `json:"sourceType"`
	SourceID      string `json:"sourceId,omitempty"`
	SourceLabel   string `json:"sourceLabel,omitempty"`
	ProviderID    string `json:"providerId"`
	ModelID       string `json:"modelId"`
	UpstreamModel string `json:"upstreamModel"`
	APIStyle      string `json:"apiStyle"`
	Enabled       bool   `json:"enabled"`
	Priority      int    `json:"priority"`
	Weight        int    `json:"weight"`
}

type UIProxyConfig struct {
	Enabled        bool   `json:"enabled"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	DebugLocalOnly *bool  `json:"debugLocalOnly,omitempty"`
}

type LoadResult struct {
	OK                   bool                    `json:"ok"`
	Path                 string                  `json:"path,omitempty"`
	Version              int                     `json:"version,omitempty"`
	Proxy                UIProxyConfig           `json:"proxy,omitempty"`
	Profiles             []UIVendor              `json:"profiles,omitempty"`
	SubscriptionAccounts []UISubscriptionAccount `json:"subscriptionAccounts,omitempty"`
	RouteBackends        []UIRouteBackend        `json:"routeBackends,omitempty"`
	Error                string                  `json:"error,omitempty"`
}

type SaveInput struct {
	Profiles             []UIVendor              `json:"profiles"`
	Proxy                *UIProxyConfig          `json:"proxy"`
	SubscriptionAccounts []UISubscriptionAccount `json:"subscriptionAccounts,omitempty"`
	RouteBackends        []UIRouteBackend        `json:"routeBackends,omitempty"`
}

type SaveResult struct {
	OK                   bool                    `json:"ok"`
	Path                 string                  `json:"path,omitempty"`
	Version              int                     `json:"version,omitempty"`
	Proxy                UIProxyConfig           `json:"proxy,omitempty"`
	Profiles             []UIVendor              `json:"profiles,omitempty"`
	SubscriptionAccounts []UISubscriptionAccount `json:"subscriptionAccounts,omitempty"`
	RouteBackends        []UIRouteBackend        `json:"routeBackends,omitempty"`
	Error                string                  `json:"error,omitempty"`
}

func vendorToUI(p profile.Profile) UIVendor {
	models := make([]UIModel, 0, len(p.Models))
	for _, m := range p.Models {
		models = append(models, UIModel{
			ID:       m.ID,
			Label:    m.Label,
			Model:    m.Model,
			APIStyle: string(m.APIStyle),
			BaseURL:  m.BaseURL,
			APIKey:   m.APIKey,
		})
	}
	adapter := strings.TrimSpace(p.ModelAdapter)
	if adapter == "" {
		adapter = "openai-compatible"
	}
	return UIVendor{
		Name:                   p.Name,
		Kind:                   p.Kind,
		LocalProvider:          p.LocalProvider,
		SubscriptionProviderID: p.SubscriptionProviderID,
		ModelAdapter:           adapter,
		BaseURL:                p.BaseURL,
		APIKey:                 p.APIKey,
		UsageQuery:             usageQueryToUI(p.UsageQuery),
		Models:                 models,
	}
}

func vendorFromUI(v UIVendor) profile.Profile {
	models := make([]profile.Model, 0, len(v.Models))
	for _, m := range v.Models {
		models = append(models, profile.Model{
			ID:       m.ID,
			Label:    m.Label,
			Model:    m.Model,
			APIStyle: profile.NormalizeAPIStyle(m.APIStyle),
			BaseURL:  m.BaseURL,
			APIKey:   m.APIKey,
		})
	}
	return profile.NormalizeVendorProfile(profile.Profile{
		Name:                   v.Name,
		Kind:                   v.Kind,
		LocalProvider:          v.LocalProvider,
		SubscriptionProviderID: v.SubscriptionProviderID,
		ModelAdapter:           v.ModelAdapter,
		BaseURL:                v.BaseURL,
		APIKey:                 v.APIKey,
		UsageQuery:             usageQueryFromUI(v.UsageQuery),
		Models:                 models,
	}, 0)
}

func subscriptionAccountToUI(account profile.SubscriptionAccount) UISubscriptionAccount {
	models := make([]UIModel, 0, len(account.Models))
	for _, m := range account.Models {
		models = append(models, UIModel{
			ID:       m.ID,
			Label:    m.Label,
			Model:    m.Model,
			APIStyle: string(m.APIStyle),
			BaseURL:  m.BaseURL,
			APIKey:   m.APIKey,
		})
	}
	return UISubscriptionAccount{
		ID:            account.ID,
		ProviderID:    account.ProviderID,
		Label:         account.Label,
		CredentialRef: account.CredentialRef,
		Status:        account.Status,
		Plan:          account.Plan,
		Models:        models,
	}
}

func subscriptionAccountFromUI(input UISubscriptionAccount) profile.SubscriptionAccount {
	models := make([]profile.Model, 0, len(input.Models))
	for _, m := range input.Models {
		models = append(models, profile.Model{
			ID:       m.ID,
			Label:    m.Label,
			Model:    m.Model,
			APIStyle: profile.NormalizeAPIStyle(m.APIStyle),
			BaseURL:  m.BaseURL,
			APIKey:   m.APIKey,
		})
	}
	return profile.SubscriptionAccount{
		ID:            strings.TrimSpace(input.ID),
		ProviderID:    strings.TrimSpace(input.ProviderID),
		Label:         strings.TrimSpace(input.Label),
		CredentialRef: strings.TrimSpace(input.CredentialRef),
		Status:        strings.TrimSpace(input.Status),
		Plan:          strings.TrimSpace(input.Plan),
		Models:        models,
	}
}

func removedSubscriptionAccounts(before []profile.SubscriptionAccount, after []profile.SubscriptionAccount) []profile.SubscriptionAccount {
	remaining := map[string]struct{}{}
	for _, raw := range after {
		account := subscriptionAccountFromUI(subscriptionAccountToUI(raw))
		if account.ID != "" {
			remaining[strings.ToLower(account.ID)] = struct{}{}
		}
	}
	var removed []profile.SubscriptionAccount
	for _, raw := range before {
		account := subscriptionAccountFromUI(subscriptionAccountToUI(raw))
		if account.ID == "" {
			continue
		}
		if _, ok := remaining[strings.ToLower(account.ID)]; !ok {
			removed = append(removed, account)
		}
	}
	return removed
}

func removeSubscriptionCredential(account profile.SubscriptionAccount) {
	path, err := resolveAuthCredentialRef(account.CredentialRef)
	if err != nil || strings.TrimSpace(path) == "" {
		return
	}
	_ = os.Remove(path)
}

func routeBackendToUI(backend profile.DerivedRouteBackend) UIRouteBackend {
	return UIRouteBackend{
		ID:            backend.ID,
		SourceType:    backend.SourceType,
		SourceID:      backend.SourceID,
		SourceLabel:   backend.SourceLabel,
		ProviderID:    backend.ProviderID,
		ModelID:       backend.ModelID,
		UpstreamModel: backend.UpstreamModel,
		APIStyle:      string(backend.APIStyle),
		Enabled:       backend.Enabled,
		Priority:      backend.Priority,
		Weight:        backend.Weight,
	}
}

func storeToUI(s *profile.Store) LoadResult {
	path, _ := cfgpkg.ProfilesPath()
	profiles := make([]UIVendor, 0, len(s.List))
	for _, p := range s.List {
		if strings.HasPrefix(strings.TrimSpace(p.Name), "__") {
			continue
		}
		profiles = append(profiles, vendorToUI(p))
	}
	accounts := make([]UISubscriptionAccount, 0, len(s.Subscriptions))
	for _, account := range s.Subscriptions {
		accounts = append(accounts, subscriptionAccountToUI(account))
	}
	backends := make([]UIRouteBackend, 0)
	for _, backend := range s.DerivedRouteBackends() {
		backends = append(backends, routeBackendToUI(backend))
	}
	return LoadResult{
		OK:      true,
		Path:    path,
		Version: s.Version,
		Proxy: UIProxyConfig{
			Enabled:        s.Proxy.Enabled,
			Host:           s.Proxy.Host,
			Port:           s.Proxy.Port,
			DebugLocalOnly: boolPtr(s.Proxy.DebugLocalOnly),
		},
		Profiles:             profiles,
		SubscriptionAccounts: accounts,
		RouteBackends:        backends,
	}
}

// LoadProfiles loads and normalizes profiles.json for the desktop UI.
func LoadProfiles() LoadResult {
	s, err := profile.WithLockedDesktopStore(func(s *profile.Store) (bool, error) {
		return profile.EnsureDefaultOllamaProfile(s), nil
	})
	if err != nil {
		return LoadResult{OK: false, Error: err.Error()}
	}
	return storeToUI(s)
}

// SaveProfiles merges UI payload into the on-disk store.
func SaveProfiles(input SaveInput) SaveResult {
	incoming := make([]profile.Profile, 0, len(input.Profiles))
	incomingNames := map[string]struct{}{}
	for _, v := range input.Profiles {
		p := vendorFromUI(v)
		if !profile.IsAllowedStoreProfile(p) {
			continue
		}
		incoming = append(incoming, p)
		incomingNames[strings.ToLower(p.Name)] = struct{}{}
	}

	current, err := profile.WithLockedDesktopStore(func(current *profile.Store) (bool, error) {
		before, err := json.Marshal(current)
		if err != nil {
			return false, err
		}
		preserved := make([]profile.Profile, 0)
		for _, p := range current.List {
			name := strings.TrimSpace(p.Name)
			if strings.HasPrefix(name, "__") {
				if _, seen := incomingNames[strings.ToLower(name)]; !seen {
					preserved = append(preserved, p)
				}
			}
		}
		current.List = append(incoming, preserved...)

		if input.Proxy != nil {
			current.Proxy = profile.ProxyConfig{
				Enabled:        input.Proxy.Enabled,
				Host:           strings.TrimSpace(input.Proxy.Host),
				Port:           input.Proxy.Port,
				DebugLocalOnly: current.Proxy.DebugLocalOnly,
			}
			if input.Proxy.DebugLocalOnly != nil {
				current.Proxy.DebugLocalOnly = *input.Proxy.DebugLocalOnly
			}
		}
		if input.SubscriptionAccounts != nil {
			beforeAccounts := append([]profile.SubscriptionAccount(nil), current.Subscriptions...)
			current.Subscriptions = current.Subscriptions[:0]
			for _, item := range input.SubscriptionAccounts {
				account := subscriptionAccountFromUI(item)
				if account.ID == "" || account.ProviderID == "" {
					continue
				}
				current.Subscriptions = append(current.Subscriptions, account)
			}
			for _, account := range removedSubscriptionAccounts(beforeAccounts, current.Subscriptions) {
				removeSubscriptionCredential(account)
			}
		}
		if input.RouteBackends != nil {
			current.RouteBackends = current.RouteBackends[:0]
			for _, item := range input.RouteBackends {
				id := strings.TrimSpace(item.ID)
				if id == "" {
					continue
				}
				enabled := item.Enabled
				current.RouteBackends = append(current.RouteBackends, profile.RouteBackend{
					ID:       id,
					Enabled:  &enabled,
					Priority: item.Priority,
					Weight:   item.Weight,
				})
			}
		}
		profile.NormalizeDesktopStore(current)
		after, err := json.Marshal(current)
		if err != nil {
			return false, err
		}
		return string(before) != string(after), nil
	})
	if err != nil {
		return SaveResult{OK: false, Error: err.Error()}
	}
	out := storeToUI(current)
	return SaveResult{
		OK:                   true,
		Path:                 out.Path,
		Version:              out.Version,
		Proxy:                out.Proxy,
		Profiles:             out.Profiles,
		SubscriptionAccounts: out.SubscriptionAccounts,
		RouteBackends:        out.RouteBackends,
	}
}

type ProxyConfigResult struct {
	OK    bool          `json:"ok"`
	Proxy UIProxyConfig `json:"proxy,omitempty"`
	Error string        `json:"error,omitempty"`
}

func proxyConfigFromStore(s *profile.Store) UIProxyConfig {
	if s == nil {
		return UIProxyConfig{}
	}
	return UIProxyConfig{
		Enabled:        s.Proxy.Enabled,
		Host:           s.Proxy.Host,
		Port:           s.Proxy.Port,
		DebugLocalOnly: boolPtr(s.Proxy.DebugLocalOnly),
	}
}

// LoadProxyConfig returns normalized proxy bind settings from profiles.json.
func LoadProxyConfig() ProxyConfigResult {
	s, err := profile.LoadDesktop()
	if err != nil {
		return ProxyConfigResult{OK: false, Error: err.Error()}
	}
	return ProxyConfigResult{OK: true, Proxy: proxyConfigFromStore(s)}
}

// SaveProxyConfig merges proxy settings into profiles.json.
func SaveProxyConfig(input UIProxyConfig) ProxyConfigResult {
	saved, err := profile.WithLockedDesktopStore(func(current *profile.Store) (bool, error) {
		current.Proxy = profile.ProxyConfig{
			Enabled:        input.Enabled,
			Host:           strings.TrimSpace(input.Host),
			Port:           input.Port,
			DebugLocalOnly: current.Proxy.DebugLocalOnly,
		}
		if input.DebugLocalOnly != nil {
			current.Proxy.DebugLocalOnly = *input.DebugLocalOnly
		}
		return true, nil
	})
	if err != nil {
		return ProxyConfigResult{OK: false, Error: err.Error()}
	}
	return ProxyConfigResult{OK: true, Proxy: proxyConfigFromStore(saved)}
}

// ParseSaveInput decodes stdin JSON for profiles save.
func ParseSaveInput(data []byte) (SaveInput, error) {
	var input SaveInput
	if err := json.Unmarshal(data, &input); err != nil {
		return SaveInput{}, fmt.Errorf("parse save payload: %w", err)
	}
	return input, nil
}

package desktop

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
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
	CLI                    string        `json:"cli,omitempty"`
	UsageQuery             *UsageQueryUI `json:"usageQuery,omitempty"`
	Models                 []UIModel     `json:"models"`
}

type UIProxyConfig struct {
	Enabled        bool   `json:"enabled"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	DebugLocalOnly *bool  `json:"debugLocalOnly,omitempty"`
}

type LoadResult struct {
	OK       bool                               `json:"ok"`
	Path     string                             `json:"path,omitempty"`
	Version  int                                `json:"version,omitempty"`
	Active   map[string]profile.ActiveSelection `json:"active,omitempty"`
	Proxy    UIProxyConfig                      `json:"proxy,omitempty"`
	Profiles []UIVendor                         `json:"profiles,omitempty"`
	Error    string                             `json:"error,omitempty"`
}

type SaveInput struct {
	Profiles []UIVendor                         `json:"profiles"`
	Active   map[string]profile.ActiveSelection `json:"active"`
	Proxy    *UIProxyConfig                     `json:"proxy"`
}

type SaveResult struct {
	OK       bool                               `json:"ok"`
	Path     string                             `json:"path,omitempty"`
	Version  int                                `json:"version,omitempty"`
	Active   map[string]profile.ActiveSelection `json:"active,omitempty"`
	Proxy    UIProxyConfig                      `json:"proxy,omitempty"`
	Profiles []UIVendor                         `json:"profiles,omitempty"`
	Error    string                             `json:"error,omitempty"`
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
		CLI:                    string(p.CLI),
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
	var cliKind agentkind.Kind
	if k, err := agentkind.Parse(v.CLI); err == nil {
		cliKind = k
	}
	return profile.NormalizeVendorProfile(profile.Profile{
		Name:                   v.Name,
		Kind:                   v.Kind,
		LocalProvider:          v.LocalProvider,
		SubscriptionProviderID: v.SubscriptionProviderID,
		ModelAdapter:           v.ModelAdapter,
		CLI:                    cliKind,
		BaseURL:                v.BaseURL,
		APIKey:                 v.APIKey,
		UsageQuery:             usageQueryFromUI(v.UsageQuery),
		Models:                 models,
	}, 0)
}

func storeToUI(s *profile.Store) LoadResult {
	path, _ := cfgpkg.ProfilesPath()
	active := map[string]profile.ActiveSelection{}
	if s.Active != nil {
		for k, v := range s.Active {
			active[k] = v
		}
	}
	profiles := make([]UIVendor, 0, len(s.List))
	for _, p := range s.List {
		if strings.HasPrefix(strings.TrimSpace(p.Name), "__") {
			continue
		}
		profiles = append(profiles, vendorToUI(p))
	}
	return LoadResult{
		OK:      true,
		Path:    path,
		Version: s.Version,
		Active:  active,
		Proxy: UIProxyConfig{
			Enabled:        s.Proxy.Enabled,
			Host:           s.Proxy.Host,
			Port:           s.Proxy.Port,
			DebugLocalOnly: boolPtr(s.Proxy.DebugLocalOnly),
		},
		Profiles: profiles,
	}
}

// LoadProfiles loads and normalizes profiles.json for the desktop UI.
func LoadProfiles() LoadResult {
	s, err := profile.WithLockedDesktopStore(func(s *profile.Store) (bool, error) {
		return profile.EnsureDefaultOllamaProfile(s) || profile.SanitizeActiveBindings(s), nil
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

		if input.Active != nil {
			current.Active = map[string]profile.ActiveSelection{}
			for k, v := range input.Active {
				current.Active[k] = v
			}
		}
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
		return true, nil
	})
	if err != nil {
		return SaveResult{OK: false, Error: err.Error()}
	}
	out := storeToUI(current)
	return SaveResult{
		OK:       true,
		Path:     out.Path,
		Version:  out.Version,
		Active:   out.Active,
		Proxy:    out.Proxy,
		Profiles: out.Profiles,
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
// active accepts both structured {provider_id, model_id} objects and legacy
// per-agent binding strings (e.g. codex/gpt-5.4 or @model:Vendor/model-id).
func ParseSaveInput(data []byte) (SaveInput, error) {
	var raw struct {
		Profiles []UIVendor                 `json:"profiles"`
		Active   map[string]json.RawMessage `json:"active"`
		Proxy    *UIProxyConfig             `json:"proxy"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return SaveInput{}, fmt.Errorf("parse save payload: %w", err)
	}
	input := SaveInput{
		Profiles: raw.Profiles,
		Active:   map[string]profile.ActiveSelection{},
		Proxy:    raw.Proxy,
	}
	if raw.Active == nil {
		return input, nil
	}
	legacyStore := &profile.Store{Active: map[string]profile.ActiveSelection{}}
	for agent, payload := range raw.Active {
		agent = strings.TrimSpace(agent)
		if agent == "" {
			continue
		}
		var sel profile.ActiveSelection
		if err := json.Unmarshal(payload, &sel); err == nil {
			sel.ProviderID = strings.TrimSpace(sel.ProviderID)
			sel.ModelID = strings.TrimSpace(sel.ModelID)
			if sel.ProviderID != "" && sel.ModelID != "" {
				input.Active[agent] = sel
				continue
			}
		}
		var legacy string
		if err := json.Unmarshal(payload, &legacy); err == nil {
			if migrated, ok := legacyStore.ActiveSelectionFromLegacyValue(legacy); ok {
				input.Active[agent] = migrated
				continue
			}
			if parts := strings.SplitN(strings.TrimSpace(legacy), "/", 2); len(parts) == 2 {
				input.Active[agent] = profile.ActiveSelection{
					ProviderID: strings.TrimSpace(parts[0]),
					ModelID:    strings.TrimSpace(parts[1]),
				}
			}
		}
	}
	return input, nil
}

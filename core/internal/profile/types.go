package profile

import "github.com/clovapi/switcher/internal/apistyle"

const StoreVersion = 6

const (
	DefaultProxyHost = "0.0.0.0"
	DefaultProxyPort = 27483
)

// Profile is one saved upstream binding (API surface + endpoint + credentials).
type Profile struct {
	Name                   string         `json:"name,omitempty"`
	Kind                   string         `json:"kind,omitempty"`
	LocalProvider          string         `json:"local_provider,omitempty"`
	SubscriptionProviderID string         `json:"subscription_provider_id,omitempty"`
	ModelAdapter           string         `json:"model_adapter,omitempty"`
	APIStyle               apistyle.Style `json:"api_style"`
	BaseURL                string         `json:"base_url"`
	APIKey                 string         `json:"api_key"`
	AccountID              string         `json:"account_id,omitempty"` // ChatGPT account id for Codex subscription upstream
	Model                  string         `json:"model,omitempty"`      // required for new profiles; used for probes and proxy defaults
	Models                 []Model        `json:"models,omitempty"`
	UsageQuery             *UsageQuery    `json:"usage_query,omitempty"`
}

// UsageQuery configures optional upstream quota/balance polling for API vendors.
// TemplateType follows cc-switch usage_script.template_type: auto, balance, token_plan.
type UsageQuery struct {
	Enabled          bool   `json:"enabled,omitempty"`
	TemplateType     string `json:"template_type,omitempty"`
	AutoIntervalMins int    `json:"auto_interval_minutes,omitempty"`
}

// Model is a desktop-compatible model entry nested under a vendor profile.
type Model struct {
	ID       string         `json:"id,omitempty"`
	Label    string         `json:"label,omitempty"`
	Model    string         `json:"model,omitempty"`
	APIStyle apistyle.Style `json:"api_style,omitempty"`
	BaseURL  string         `json:"base_url,omitempty"`
	APIKey   string         `json:"api_key,omitempty"`
}

// ProxyConfig describes the built-in local proxy/daemon endpoint.
type ProxyConfig struct {
	Enabled        bool   `json:"enabled"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	DebugLocalOnly bool   `json:"debug_local_only,omitempty"`
}

// Store is persisted JSON.
type Store struct {
	Version int         `json:"version"`
	List    []Profile   `json:"profiles"` // all saved vendor/API profiles
	Proxy   ProxyConfig `json:"proxy"`
}

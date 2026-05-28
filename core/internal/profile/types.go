package profile

import (
	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
)

const StoreVersion = 5

// Profile is one saved upstream binding (API surface + endpoint + credentials).
// The simple top-level fields preserve the original CLI profile shape; Kind/Models
// mirror the desktop vendor model so the CLI can become the headless core.
type Profile struct {
	Name                   string         `json:"name,omitempty"`
	Kind                   string         `json:"kind,omitempty"`
	LocalProvider          string         `json:"local_provider,omitempty"`
	SubscriptionProviderID string         `json:"subscription_provider_id,omitempty"`
	ModelAdapter           string         `json:"model_adapter,omitempty"`
	CLI                    agentkind.Kind `json:"cli,omitempty"`
	APIStyle               apistyle.Style `json:"api_style"`
	BaseURL                string         `json:"base_url"`
	APIKey                 string         `json:"api_key"`
	AccountID              string         `json:"account_id,omitempty"` // ChatGPT account id for Codex subscription upstream
	Model                  string         `json:"model,omitempty"`      // required for new profiles; used for probes and agent defaults
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

// ActiveSelection is the persisted provider/model selected for one local agent.
type ActiveSelection struct {
	ProviderID string `json:"provider_id"`
	ModelID    string `json:"model_id"`
}

// Store is persisted JSON.
type Store struct {
	Version int                        `json:"version"`
	Active  map[string]ActiveSelection `json:"active"`   // agent kind -> active provider/model
	List    []Profile                  `json:"profiles"` // all saved vendor/API profiles
	Proxy   ProxyConfig                `json:"proxy"`
}

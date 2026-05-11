package profile

import (
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
)

const StoreVersion = 1

// Profile is one saved upstream binding (API surface + endpoint + credentials).
// CLI is the target CLI kind for this profile.
type Profile struct {
	Name        string         `json:"name,omitempty"`
	CLI         clikind.Kind   `json:"cli,omitempty"`
	APIStyle    apistyle.Style `json:"api_style"`
	BaseURL     string         `json:"base_url"`
	APIKey      string         `json:"api_key"`
	Model       string         `json:"model,omitempty"` // required for new profiles; used for probes and agent defaults
}

// Store is persisted JSON.
type Store struct {
	Version int               `json:"version"`
	Active  map[string]string `json:"active"`   // cli kind -> active profile name
	List    []Profile         `json:"profiles"` // all saved profiles
}

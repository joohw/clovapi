package profile

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	cfgpkg "github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/syslog"
)

func defaultProxyConfig() ProxyConfig {
	return ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27483}
}

func ensureProxyDefaults(s *Store, oldVersion int) {
	if s == nil {
		return
	}
	if strings.TrimSpace(s.Proxy.Host) == "" {
		s.Proxy.Host = "127.0.0.1"
	}
	if s.Proxy.Port == 0 {
		s.Proxy.Port = 27483
	}
	// Preserve an explicit false when loading an existing v4 store. Empty stores
	// and pre-v4 stores have no way to express false, so default them to enabled.
	if oldVersion == 0 || oldVersion < StoreVersion {
		s.Proxy.Enabled = true
	}
}

func emptyStore() *Store {
	return &Store{
		Version: StoreVersion,
		Active:  map[string]ActiveSelection{},
		List:    nil,
		Proxy:   defaultProxyConfig(),
	}
}

func (a ActiveSelection) normalized() ActiveSelection {
	return ActiveSelection{
		ProviderID: strings.TrimSpace(a.ProviderID),
		ModelID:    strings.TrimSpace(a.ModelID),
	}
}

func (a ActiveSelection) valid() bool {
	a = a.normalized()
	return a.ProviderID != "" && a.ModelID != ""
}

// UnmarshalJSON accepts both the v5 structured active map and the v4
// string-shaped map used for @model:Vendor/model bindings.
func (s *Store) UnmarshalJSON(data []byte) error {
	var raw struct {
		Version int                        `json:"version"`
		Active  map[string]json.RawMessage `json:"active"`
		List    []Profile                  `json:"profiles"`
		Proxy   ProxyConfig                `json:"proxy"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*s = Store{
		Version: raw.Version,
		Active:  map[string]ActiveSelection{},
		List:    raw.List,
		Proxy:   raw.Proxy,
	}
	for agent, payload := range raw.Active {
		var sel ActiveSelection
		if err := json.Unmarshal(payload, &sel); err == nil && sel.valid() {
			s.Active[agent] = sel.normalized()
			continue
		}
		var legacy string
		if err := json.Unmarshal(payload, &legacy); err == nil {
			if migrated, ok := s.activeSelectionFromLegacyValue(legacy); ok {
				s.Active[agent] = migrated
			}
		}
	}
	return nil
}

// Reset clears all profiles and active bindings and persists an empty store.
func Reset() error {
	return Save(emptyStore())
}

// Load reads profiles.json or returns an empty store if missing.
func Load() (*Store, error) {
	p, err := cfgpkg.ProfilesPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return emptyStore(), nil
		}
		return nil, err
	}
	var s Store
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse %s: %w", p, err)
	}
	migrateLegacyCurrentIntoProfiles(data, &s)
	migrateLegacyAPIStyles(&s)
	oldVersion := s.Version
	if s.Version == 0 {
		s.Version = StoreVersion
	}
	if s.Active == nil {
		s.Active = map[string]ActiveSelection{}
	}
	ensureProxyDefaults(&s, oldVersion)
	return &s, nil
}

type legacyStoreCompat struct {
	Current *Profile `json:"current,omitempty"`
}

// migrateLegacyCurrentIntoProfiles copies old "current" entry into profiles list.
func migrateLegacyCurrentIntoProfiles(raw []byte, s *Store) {
	if s == nil {
		return
	}
	var legacy legacyStoreCompat
	if err := json.Unmarshal(raw, &legacy); err != nil || legacy.Current == nil {
		return
	}
	cur := *legacy.Current
	if strings.TrimSpace(cur.BaseURL) == "" || cur.APIStyle == "" {
		return
	}
	cur.CLI = ""
	cur.Name = ""
	if len(s.List) == 0 {
		s.List = append(s.List, cur)
		return
	}
	for _, p := range s.List {
		if strings.TrimSpace(p.BaseURL) == strings.TrimSpace(cur.BaseURL) &&
			p.APIStyle == cur.APIStyle &&
			strings.TrimSpace(p.Model) == strings.TrimSpace(cur.Model) &&
			strings.TrimSpace(p.APIKey) == strings.TrimSpace(cur.APIKey) {
			return
		}
	}
	s.List = append(s.List, cur)
}

// migrateLegacyAPIStyles maps pre-split JSON api_style "openai" → openai-responses (Codex wire_api).
func migrateLegacyAPIStyles(s *Store) {
	for i := range s.List {
		if string(s.List[i].APIStyle) == "openai" {
			s.List[i].APIStyle = apistyle.OpenAIResponses
		}
	}
}

// Save writes atomically with 0600.
func Save(s *Store) error {
	if s.Version == 0 {
		s.Version = StoreVersion
	}
	if s.Active == nil {
		s.Active = map[string]ActiveSelection{}
	}
	ensureProxyDefaults(s, s.Version)
	p, err := cfgpkg.ProfilesPath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, p); err != nil {
		_ = os.Remove(tmp)
		syslog.Write("stderr", fmt.Sprintf("profiles save failed: %v", err))
		return err
	}
	syslog.Write("system", s.LogSavedMessage())
	return nil
}

func (s *Store) LogSavedMessage() string {
	if s == nil {
		return "profiles saved vendors=0 bindings=0"
	}
	vendors := 0
	bindings := 0
	for _, prof := range s.List {
		name := strings.TrimSpace(prof.Name)
		if name != "" && !strings.HasPrefix(name, "__") {
			vendors++
		}
	}
	for _, sel := range s.Active {
		if sel.valid() {
			bindings++
		}
	}
	return fmt.Sprintf("profiles saved vendors=%d bindings=%d", vendors, bindings)
}

func (s *Store) LogSummary() string {
	userCount := 0
	for _, prof := range s.List {
		name := strings.TrimSpace(prof.Name)
		if name != "" && !strings.HasPrefix(name, "__") {
			userCount++
		}
	}
	parts := make([]string, 0, len(s.Active))
	for cli, sel := range s.Active {
		sel = sel.normalized()
		if sel.valid() {
			parts = append(parts, fmt.Sprintf("%s=%s/%s", cli, sel.ProviderID, sel.ModelID))
		}
	}
	activeSummary := "none"
	if len(parts) > 0 {
		activeSummary = strings.Join(parts, ", ")
	}
	return fmt.Sprintf("%d vendors, active: %s", userCount, activeSummary)
}

// ProfilesPath returns the on-disk profiles.json path.
func ProfilesPath() (string, error) {
	return cfgpkg.ProfilesPath()
}

func (s *Store) Index(name string) int {
	n := strings.TrimSpace(strings.ToLower(name))
	for i, p := range s.List {
		if strings.ToLower(strings.TrimSpace(p.Name)) == n {
			return i
		}
	}
	return -1
}

func (s *Store) Get(name string) (Profile, bool) {
	i := s.Index(name)
	if i < 0 {
		return Profile{}, false
	}
	return s.List[i], true
}

func (s *Store) Upsert(p Profile) {
	if i := s.Index(p.Name); i >= 0 {
		s.List[i] = p
		return
	}
	s.List = append(s.List, p)
}

func (s *Store) Remove(name string) bool {
	i := s.Index(name)
	if i < 0 {
		return false
	}
	removed := s.List[i]
	s.List = slices.Delete(s.List, i, i+1)
	providerID := ProviderIDFromStoreProfile(removed)
	for k, v := range s.Active {
		if strings.TrimSpace(providerID) != "" && strings.EqualFold(strings.TrimSpace(v.ProviderID), providerID) {
			delete(s.Active, k)
		}
	}
	return true
}

func (s *Store) SetActive(cli string, providerID string, modelID string) {
	if s.Active == nil {
		s.Active = map[string]ActiveSelection{}
	}
	sel := ActiveSelection{ProviderID: providerID, ModelID: modelID}.normalized()
	if sel.valid() {
		s.Active[cli] = sel
	}
}

// ClearActive removes the saved active profile binding for this CLI kind (e.g. after reset-default).
func (s *Store) ClearActive(cli string) {
	if s.Active == nil {
		return
	}
	delete(s.Active, cli)
}

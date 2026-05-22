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
		Active:  map[string]string{},
		List:    nil,
		Proxy:   defaultProxyConfig(),
	}
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
		s.Active = map[string]string{}
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
		s.Active = map[string]string{}
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
		return err
	}
	return nil
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
	s.List = slices.Delete(s.List, i, i+1)
	for k, v := range s.Active {
		if strings.EqualFold(strings.TrimSpace(v), strings.TrimSpace(name)) {
			delete(s.Active, k)
		}
	}
	return true
}

func (s *Store) SetActive(cli string, profileName string) {
	if s.Active == nil {
		s.Active = map[string]string{}
	}
	s.Active[cli] = profileName
}

// ClearActive removes the saved active profile binding for this CLI kind (e.g. after reset-default).
func (s *Store) ClearActive(cli string) {
	if s.Active == nil {
		return
	}
	delete(s.Active, cli)
}

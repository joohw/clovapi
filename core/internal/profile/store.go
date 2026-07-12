package profile

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	cfgpkg "github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/syslog"
)

func defaultProxyConfig() ProxyConfig {
	return ProxyConfig{Enabled: true, Host: DefaultProxyHost, Port: DefaultProxyPort}
}

func ensureProxyDefaults(s *Store, oldVersion int) {
	if s == nil {
		return
	}
	if strings.TrimSpace(s.Proxy.Host) == "" {
		s.Proxy.Host = DefaultProxyHost
	}
	if s.Proxy.Port == 0 {
		s.Proxy.Port = DefaultProxyPort
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
		List:    nil,
		Proxy:   defaultProxyConfig(),
	}
}

// Reset clears all profiles and persists an empty store.
func Reset() error {
	return Save(emptyStore())
}

func loadNoLock() (*Store, error) {
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
	EnsureDefaultSubscriptionAccounts(&s)
	oldVersion := s.Version
	if s.Version < StoreVersion {
		s.Version = StoreVersion
	}
	ensureProxyDefaults(&s, oldVersion)
	return &s, nil
}

// Load reads profiles.json or returns an empty store if missing.
func Load() (*Store, error) {
	return loadNoLock()
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

// migrateLegacyAPIStyles maps older JSON api_style names to canonical styles.
func migrateLegacyAPIStyles(s *Store) {
	for i := range s.List {
		s.List[i].APIStyle = NormalizeAPIStyle(string(s.List[i].APIStyle))
		for j := range s.List[i].Models {
			s.List[i].Models[j].APIStyle = NormalizeAPIStyle(string(s.List[i].Models[j].APIStyle))
		}
	}
}

func saveNoLock(s *Store) error {
	if s.Version < StoreVersion {
		s.Version = StoreVersion
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
	if existing, readErr := os.ReadFile(p); readErr == nil && bytes.Equal(existing, data) {
		return nil
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

// Save writes atomically with 0600.
func Save(s *Store) error {
	unlock, err := lockProfiles()
	if err != nil {
		return err
	}
	defer unlock()
	return saveNoLock(s)
}

// WithLockedStore performs a read-modify-write transaction on profiles.json.
// The callback returns whether the modified store should be persisted.
func WithLockedStore(fn func(*Store) (bool, error)) (*Store, error) {
	unlock, err := lockProfiles()
	if err != nil {
		return nil, err
	}
	defer unlock()
	s, err := loadNoLock()
	if err != nil {
		return nil, err
	}
	changed, err := fn(s)
	if err != nil {
		return nil, err
	}
	if changed {
		if err := saveNoLock(s); err != nil {
			return nil, err
		}
	}
	return s, nil
}

func (s *Store) LogSavedMessage() string {
	if s == nil {
		return "profiles saved vendors=0"
	}
	vendors := 0
	for _, prof := range s.List {
		name := strings.TrimSpace(prof.Name)
		if name != "" && !strings.HasPrefix(name, "__") {
			vendors++
		}
	}
	return fmt.Sprintf("profiles saved vendors=%d", vendors)
}

func (s *Store) LogSummary() string {
	userCount := 0
	for _, prof := range s.List {
		name := strings.TrimSpace(prof.Name)
		if name != "" && !strings.HasPrefix(name, "__") {
			userCount++
		}
	}
	return fmt.Sprintf("%d vendors", userCount)
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
	_ = removed
	return true
}

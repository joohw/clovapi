package profile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	cfgpkg "github.com/clovapi/switcher/internal/config"
)

func TestEffectiveCurrentPrefersActiveBinding(t *testing.T) {
	s := &Store{
		Active: map[string]string{
			string(clikind.Codex): "b",
		},
		List: []Profile{
			{Name: "a", CLI: clikind.Codex, APIStyle: apistyle.Claude, BaseURL: "https://a", APIKey: "1", Model: "m1"},
			{Name: "b", CLI: clikind.Codex, APIStyle: apistyle.Claude, BaseURL: "https://b", APIKey: "2", Model: "m2"},
		},
	}
	p, ok := s.EffectiveCurrent()
	if !ok || p.BaseURL != "https://b" {
		t.Fatalf("got %+v ok=%v", p, ok)
	}
}

func TestLoadMigratesLegacyCurrentIntoProfiles(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	path, err := cfgpkg.ProfilesPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	raw := `{"version":1,"current":{"api_style":"claude","base_url":"https://legacy","api_key":"k","model":"m"},"active":{},"profiles":[]}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(s.List) != 1 || s.List[0].BaseURL != "https://legacy" {
		t.Fatalf("profiles: %+v", s.List)
	}
}

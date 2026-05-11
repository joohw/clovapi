package profile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	cfgpkg "github.com/clovapi/switcher/internal/config"
)

func TestLoadSaveRoundtrip(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	s.Upsert(Profile{Name: "a", CLI: clikind.Codex, APIStyle: apistyle.OpenAIResponses, BaseURL: "https://x/v1", APIKey: "k", Model: "m"})
	s.SetActive(string(clikind.Codex), "a")
	if err := Save(s); err != nil {
		t.Fatal(err)
	}

	s2, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(s2.List) != 1 || s2.List[0].Name != "a" {
		t.Fatalf("%+v", s2.List)
	}
	if s2.Active[string(clikind.Codex)] != "a" {
		t.Fatal(s2.Active)
	}

	if !s2.Remove("a") {
		t.Fatal("remove")
	}
	if len(s2.List) != 0 {
		t.Fatal(s2.List)
	}
	if _, ok := s2.Active[string(clikind.Codex)]; ok {
		t.Fatal("active should clear")
	}
}

func TestLoadMigratesLegacyOpenAI(t *testing.T) {
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
	raw := `{"version":1,"active":{},"profiles":[{"name":"old","cli":"codex","api_style":"openai","base_url":"u","api_key":"k","model":"m"}]}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(s.List) != 1 || s.List[0].APIStyle != apistyle.OpenAIResponses {
		t.Fatalf("got %+v", s.List)
	}
}

func TestReset(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	s.Upsert(Profile{Name: "x", CLI: clikind.Codex, APIStyle: apistyle.OpenAIResponses, BaseURL: "u", APIKey: "k", Model: "m"})
	if err := Save(s); err != nil {
		t.Fatal(err)
	}
	if err := Reset(); err != nil {
		t.Fatal(err)
	}
	s3, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(s3.List) != 0 || len(s3.Active) != 0 {
		t.Fatalf("after reset: %+v %+v", s3.List, s3.Active)
	}
}

func TestClearActive(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	s.SetActive(string(clikind.OpenCode), "p1")
	s.ClearActive(string(clikind.OpenCode))
	if len(s.Active) != 0 {
		t.Fatalf("active map: %+v", s.Active)
	}
}

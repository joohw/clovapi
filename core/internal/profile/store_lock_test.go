package profile

import (
	"testing"

	"github.com/clovapi/switcher/internal/config"
)

func TestWithLockedStoreAppliesSequentialUpdatesToLatestStore(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })

	if err := Save(emptyStore()); err != nil {
		t.Fatal(err)
	}
	if _, err := WithLockedStore(func(s *Store) (bool, error) {
		s.SetActive("claude-code", "codex", "gpt-5.4")
		return true, nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := WithLockedStore(func(s *Store) (bool, error) {
		s.SetActive("codex", "claude-code", "claude-opus-4-7")
		return true, nil
	}); err != nil {
		t.Fatal(err)
	}

	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Active["claude-code"].ModelID != "gpt-5.4" {
		t.Fatalf("claude-code active = %+v", got.Active["claude-code"])
	}
	if got.Active["codex"].ModelID != "claude-opus-4-7" {
		t.Fatalf("codex active = %+v", got.Active["codex"])
	}
}

func TestWithLockedDesktopStorePersistsNormalizeOnlyChanges(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })

	if err := Save(&Store{
		Version: StoreVersion,
		Active: map[string]ActiveSelection{
			"claude-code": {ProviderID: "missing-provider", ModelID: "missing-model"},
		},
		Proxy: defaultProxyConfig(),
	}); err != nil {
		t.Fatal(err)
	}

	got, err := WithLockedDesktopStore(func(s *Store) (bool, error) {
		if len(s.List) == 0 {
			t.Fatal("expected desktop normalization to add default vendors before callback")
		}
		if _, ok := s.Active["claude-code"]; ok {
			t.Fatal("expected desktop normalization to remove stale active binding before callback")
		}
		return false, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.List) == 0 {
		t.Fatal("expected normalized store to include default vendors")
	}

	raw, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw.List) == 0 {
		t.Fatal("expected normalize-only default vendors to be persisted")
	}
	if _, ok := raw.Active["claude-code"]; ok {
		t.Fatal("expected normalize-only stale active cleanup to be persisted")
	}
}

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

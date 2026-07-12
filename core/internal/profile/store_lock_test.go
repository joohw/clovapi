package profile

import (
	"testing"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/syslog"
)

func TestWithLockedStoreAppliesSequentialUpdatesToLatestStore(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })

	if err := Save(emptyStore()); err != nil {
		t.Fatal(err)
	}
	if _, err := WithLockedStore(func(s *Store) (bool, error) {
		s.Upsert(Profile{Name: "Custom API", Kind: "api", Model: "first", BaseURL: "https://one.example/v1", APIKey: "one"})
		return true, nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := WithLockedStore(func(s *Store) (bool, error) {
		s.Upsert(Profile{Name: "Ollama", Kind: "local", Model: "llama3.2", BaseURL: "http://127.0.0.1:11434/v1", APIKey: "ollama"})
		return true, nil
	}); err != nil {
		t.Fatal(err)
	}

	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.Get("Custom API"); !ok {
		t.Fatal("Custom API profile was not persisted")
	}
	if _, ok := got.Get("Ollama"); !ok {
		t.Fatal("Ollama profile was not persisted")
	}
}

func TestSaveSkipsUnchangedStoreAndSystemLog(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })

	store := emptyStore()
	if err := Save(store); err != nil {
		t.Fatal(err)
	}
	before, err := syslog.List(0)
	if err != nil {
		t.Fatal(err)
	}
	if err := Save(store); err != nil {
		t.Fatal(err)
	}
	after, err := syslog.List(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != len(before) {
		t.Fatalf("unchanged save added system logs: before=%d after=%d", len(before), len(after))
	}
}

func TestWithLockedDesktopStorePersistsNormalizeOnlyChanges(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })

	if err := Save(&Store{Version: StoreVersion, Proxy: defaultProxyConfig()}); err != nil {
		t.Fatal(err)
	}

	got, err := WithLockedDesktopStore(func(s *Store) (bool, error) {
		if len(s.List) == 0 {
			t.Fatal("expected desktop normalization to add default vendors before callback")
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
}

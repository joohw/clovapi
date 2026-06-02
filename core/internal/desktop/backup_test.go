package desktop

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func seedCodexStore(t *testing.T, stateDir string) {
	t.Helper()
	config.SetDirOverride(stateDir)
	t.Cleanup(func() { config.SetDirOverride("") })
	if err := profile.Save(&profile.Store{
		Version: profile.StoreVersion,
		Active:  map[string]profile.ActiveSelection{},
		Proxy:   profile.ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27483},
		List: []profile.Profile{
			{
				Name:                   provider.CodexVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.CodexProviderID,
				Models:                 []profile.Model{{ID: "gpt-5.5", Model: "gpt-5.5"}},
			},
		},
	}); err != nil {
		t.Fatal(err)
	}
}

func TestApplyProviderModelResetRestoresExactConfigBackup(t *testing.T) {
	home := t.TempDir()
	stateDir := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	seedCodexStore(t, stateDir)

	configPath, err := cliConfigPath(agentkind.Codex)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
		t.Fatal(err)
	}
	original := []byte("model_provider = \"openai\"\nmodel = \"gpt-old\"\n\n[model_providers.openai]\nname = \"openai\"\nbase_url = \"https://api.openai.com/v1\"\n")
	if err := os.WriteFile(configPath, original, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ApplyProviderModel(agentkind.Codex, provider.CodexProviderID, "gpt-5.5"); err != nil {
		t.Fatal(err)
	}
	store, err := profile.Load()
	if err != nil {
		t.Fatal(err)
	}
	backup, ok := store.BackupForCLI(string(agentkind.Codex))
	if !ok || !backup.Existed || !bytes.Equal(backup.Content, original) {
		t.Fatalf("unexpected backup: ok=%v existed=%v size=%d", ok, backup.Existed, len(backup.Content))
	}

	if err := ResetCLIToDefault(agentkind.Codex); err != nil {
		t.Fatal(err)
	}
	restored, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(restored, original) {
		t.Fatalf("restored config mismatch\nwant:\n%s\n got:\n%s", string(original), string(restored))
	}
	store, err = profile.Load()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := store.BackupForCLI(string(agentkind.Codex)); ok {
		t.Fatal("expected codex backup to be cleared after reset")
	}
	if _, ok := store.Active[string(agentkind.Codex)]; ok {
		t.Fatal("expected codex active binding to be cleared after reset")
	}
}

func TestApplyProviderModelResetRemovesNewConfigWhenNoOriginalFile(t *testing.T) {
	home := t.TempDir()
	stateDir := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	seedCodexStore(t, stateDir)

	configPath, err := cliConfigPath(agentkind.Codex)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(configPath); !os.IsNotExist(err) {
		t.Fatalf("expected missing config before apply, got err=%v", err)
	}

	if err := ApplyProviderModel(agentkind.Codex, provider.CodexProviderID, "gpt-5.5"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("expected config to exist after apply: %v", err)
	}
	if err := ResetCLIToDefault(agentkind.Codex); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(configPath); !os.IsNotExist(err) {
		t.Fatalf("expected reset to remove new config file, got err=%v", err)
	}
}

func TestEnsureCLIBackupOnlyCapturesOnce(t *testing.T) {
	home := t.TempDir()
	stateDir := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	seedCodexStore(t, stateDir)

	configPath, err := cliConfigPath(agentkind.Codex)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
		t.Fatal(err)
	}
	original := []byte("model_provider = \"openai\"\n")
	if err := os.WriteFile(configPath, original, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ApplyProviderModel(agentkind.Codex, provider.CodexProviderID, "gpt-5.5"); err != nil {
		t.Fatal(err)
	}
	if err := ApplyProviderModel(agentkind.Codex, provider.CodexProviderID, "gpt-5.5"); err != nil {
		t.Fatal(err)
	}

	store, err := profile.Load()
	if err != nil {
		t.Fatal(err)
	}
	backup, ok := store.BackupForCLI(string(agentkind.Codex))
	if !ok || !bytes.Equal(backup.Content, original) {
		t.Fatalf("backup should stay at first snapshot: ok=%v content=%q", ok, string(backup.Content))
	}
}

func TestResetCLIToDefaultLegacyFallbackWithoutBackup(t *testing.T) {
	home := t.TempDir()
	stateDir := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	seedCodexStore(t, stateDir)

	configPath, err := cliConfigPath(agentkind.Codex)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
		t.Fatal(err)
	}
	clovapiOnly := []byte("model_provider = \"clovapi\"\nmodel = \"gpt-5.5\"\n\n[model_providers.clovapi]\nname = \"clovapi\"\n")
	if err := os.WriteFile(configPath, clovapiOnly, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ResetCLIToDefault(agentkind.Codex); err != nil {
		t.Fatal(err)
	}
	restored, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(restored, []byte("clovapi")) {
		t.Fatalf("expected legacy reset to strip clovapi keys, got:\n%s", string(restored))
	}
}

func TestRestoreUsesCurrentCODEXHome(t *testing.T) {
	home := t.TempDir()
	stateDir := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	oldHome := filepath.Join(home, ".codex")
	t.Setenv("CODEX_HOME", oldHome)
	seedCodexStore(t, stateDir)

	oldPath := filepath.Join(oldHome, "config.toml")
	if err := os.MkdirAll(oldHome, 0o700); err != nil {
		t.Fatal(err)
	}
	original := []byte("model_provider = \"openai\"\n")
	if err := os.WriteFile(oldPath, original, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ApplyProviderModel(agentkind.Codex, provider.CodexProviderID, "gpt-5.5"); err != nil {
		t.Fatal(err)
	}

	newHome := filepath.Join(home, "custom-codex")
	t.Setenv("CODEX_HOME", newHome)
	newPath := filepath.Join(newHome, "config.toml")
	if err := os.MkdirAll(newHome, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(newPath, []byte("model_provider = \"clovapi\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ResetCLIToDefault(agentkind.Codex); err != nil {
		t.Fatal(err)
	}
	restored, err := os.ReadFile(newPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(restored, original) {
		t.Fatalf("restore should target current CODEX_HOME path\nwant:\n%s\n got:\n%s", string(original), string(restored))
	}
	stale, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatalf("expected stale config path to remain on disk: %v", err)
	}
	if bytes.Equal(stale, original) {
		t.Fatal("stale backup path should not receive restored snapshot")
	}
}

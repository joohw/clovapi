package apply

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenCodeConfigPath_PrefersConfigJsonWhenPresent(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)

	dir := filepath.Join(h, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv(envOpenCodeDirOverride, dir)
	configPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(configPath, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := OpenCodeConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	if got != configPath {
		t.Fatalf("got %q want %q", got, configPath)
	}
}

func TestOpenCodeWritablePrefersOpenCodeJsonOverConfig(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)
	dir := filepath.Join(h, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv(envOpenCodeDirOverride, dir)
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"model":"openai/gpt-4"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	openPath := filepath.Join(dir, "opencode.json")
	if err := os.WriteFile(openPath, []byte(`{"theme":"opencode"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := OpenCodeWritableConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	if got != openPath {
		t.Fatalf("got %q want %q", got, openPath)
	}
}

func TestOpenCodeConfigPath_DefaultWhenMissing(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)
	dir := filepath.Join(h, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv(envOpenCodeDirOverride, dir)

	want := filepath.Join(dir, "opencode.jsonc")
	got, err := OpenCodeConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

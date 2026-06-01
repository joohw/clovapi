package apply

import (
	"path/filepath"
	"testing"
)

func TestCodexHomeDirUsesCODEX_HOME(t *testing.T) {
	want := filepath.Join(t.TempDir(), "custom-codex")
	t.Setenv("CODEX_HOME", want)
	got, err := CodexHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Clean(want) {
		t.Fatalf("CodexHomeDir() = %q, want %q", got, want)
	}
}

func TestCodexConfigPathUsesCODEX_HOME(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CODEX_HOME", root)
	got, err := CodexConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "config.toml")
	if got != want {
		t.Fatalf("CodexConfigPath() = %q, want %q", got, want)
	}
}
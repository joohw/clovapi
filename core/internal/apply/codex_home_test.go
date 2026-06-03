package apply

import (
	"os"
	"path/filepath"
	"runtime"
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
func TestResolveCodexExecutableIgnoresWindowsStoreClient(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows Store Codex layout is Windows-only")
	}
	root := t.TempDir()
	storeBin := filepath.Join(root, "WindowsApps", "OpenAI.Codex_1.0.0.0_x64__2p2nqsd0c76g0", "app", "resources")
	if err := os.MkdirAll(storeBin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(storeBin, "codex.exe"), []byte(""), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", storeBin)
	t.Setenv("HOME", root)
	t.Setenv("USERPROFILE", root)
	t.Setenv("APPDATA", filepath.Join(root, "AppData"))
	t.Setenv("LOCALAPPDATA", filepath.Join(root, "LocalAppData"))
	if got, ok := ResolveCodexExecutable(); ok {
		t.Fatalf("ResolveCodexExecutable() = %q, true; want Windows Store client ignored", got)
	}
	if CodexInstalled() {
		t.Fatal("CodexInstalled() = true for Windows Store client; want false")
	}
}

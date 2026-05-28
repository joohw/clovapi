package desktop

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestResolveCommandPathUsesCommonUserBinDirs(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("HOME-based user bin probing is only used on Unix-like platforms")
	}
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("PATH", "")
	binDir := filepath.Join(root, ".local", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(binDir, "clovapi-test-agent")
	if err := os.WriteFile(exe, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	got, ok := ResolveCommandPath("clovapi-test-agent")
	if !ok {
		t.Fatal("expected command to resolve from ~/.local/bin")
	}
	if got != exe {
		t.Fatalf("path = %q, want %q", got, exe)
	}
}

func TestCommandWhichRequiresCommand(t *testing.T) {
	got := CommandWhich("")
	if got.OK || got.Exists || got.Error == "" {
		t.Fatalf("CommandWhich empty = %+v", got)
	}
}

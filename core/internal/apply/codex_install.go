package apply

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// CodexSearchDirs lists user-level directories where the Codex CLI may be installed
// when GUI apps have a minimal PATH (npm global, standalone installer, etc.).
func CodexSearchDirs(home string) []string {
	home = filepath.Clean(strings.TrimSpace(home))
	var dirs []string
	seen := map[string]struct{}{}
	add := func(dir string) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return
		}
		dir = filepath.Clean(dir)
		if _, ok := seen[dir]; ok {
			return
		}
		seen[dir] = struct{}{}
		dirs = append(dirs, dir)
	}
	if home != "" && home != "." {
		add(filepath.Join(home, ".local", "bin"))
	}
	addWindowsCodexSearchDirs(add)
	addDarwinCodexSearchDirs(add, home)
	if prefix, ok := npmGlobalPrefix(); ok {
		add(prefix)
	}
	return dirs
}

func codexCommandNames() []string {
	if runtime.GOOS == "windows" {
		return []string{"codex", "codex.exe", "codex.cmd", "codex.ps1", "codex.bat"}
	}
	return []string{"codex"}
}

func codexExecutableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	if runtime.GOOS == "windows" {
		return true
	}
	return info.Mode()&0o111 != 0
}

// ResolveCodexExecutable finds the Codex CLI binary from PATH or common install roots.
func ResolveCodexExecutable() (string, bool) {
	if p, err := exec.LookPath("codex"); err == nil && strings.TrimSpace(p) != "" && !codexClientExecutablePath(p) {
		return p, true
	}
	home, _ := os.UserHomeDir()
	for _, dir := range CodexSearchDirs(home) {
		for _, name := range codexCommandNames() {
			candidate := filepath.Join(dir, name)
			if codexExecutableFile(candidate) && !codexClientExecutablePath(candidate) {
				return candidate, true
			}
		}
	}
	return "", false
}

// CodexInstalled reports whether the Codex CLI is available.
// Desktop/Store app installs are intentionally ignored here.
func CodexInstalled() bool {
	_, ok := ResolveCodexExecutable()
	return ok
}

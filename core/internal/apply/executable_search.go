package apply

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func resolveExecutableBySearch(name string) (string, error) {
	for _, candidate := range executableSearchCandidates(name) {
		if regularFile(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("executable not found: %s", name)
}

func executableSearchCandidates(name string) []string {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	var out []string
	seen := map[string]struct{}{}
	add := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		cleaned := filepath.Clean(path)
		if _, ok := seen[cleaned]; ok {
			return
		}
		seen[cleaned] = struct{}{}
		out = append(out, cleaned)
	}
	for _, dir := range executableSearchDirs() {
		for _, file := range executableCommandNames(name) {
			add(filepath.Join(dir, file))
		}
	}
	return out
}

func executableCommandNames(name string) []string {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	if runtime.GOOS != "windows" {
		return []string{name}
	}
	lower := strings.ToLower(name)
	out := []string{name}
	for _, ext := range []string{".exe", ".cmd", ".ps1", ".bat"} {
		if strings.HasSuffix(lower, ext) {
			continue
		}
		out = append(out, name+ext)
	}
	return out
}

func executableSearchDirs() []string {
	var dirs []string
	seen := map[string]struct{}{}
	add := func(dir string) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return
		}
		cleaned := filepath.Clean(dir)
		if _, ok := seen[cleaned]; ok {
			return
		}
		seen[cleaned] = struct{}{}
		dirs = append(dirs, cleaned)
	}
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		add(dir)
	}
	home, _ := os.UserHomeDir()
	if strings.TrimSpace(home) != "" {
		home = filepath.Clean(home)
		add(filepath.Join(home, "bin"))
		add(filepath.Join(home, ".local", "bin"))
		add(filepath.Join(home, ".npm-global", "bin"))
		add(filepath.Join(home, ".volta", "bin"))
		add(filepath.Join(home, ".local", "share", "fnm", "current", "bin"))
		add(filepath.Join(home, ".fnm", "current", "bin"))
		add(filepath.Join(home, "Library", "pnpm"))
		add(filepath.Join(home, ".opencode", "bin"))
	}
	for _, dir := range platformExecutableSearchDirs(home) {
		add(dir)
	}
	for _, dir := range loginShellExecutableSearchDirs() {
		add(dir)
	}
	if runtime.GOOS != "windows" {
		add("/opt/homebrew/bin")
		add("/opt/homebrew/sbin")
		add("/usr/local/bin")
		add("/usr/local/sbin")
		add("/usr/bin")
		add("/bin")
	}
	return dirs
}

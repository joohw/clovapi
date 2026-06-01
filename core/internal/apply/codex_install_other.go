//go:build !windows

package apply

import (
	"os"
	"path/filepath"
)

func addWindowsCodexSearchDirs(add func(string)) {}

func addDarwinCodexSearchDirs(add func(string), home string) {
	if home == "" || home == "." {
		return
	}
	add(filepath.Join(home, ".npm-global", "bin"))
}

func codexExtraExecutableCandidates() []string {
	var out []string
	for _, appRoot := range darwinCodexAppRoots() {
		out = append(out,
			filepath.Join(appRoot, "Contents", "MacOS", "codex"),
			filepath.Join(appRoot, "Contents", "MacOS", "Codex"),
			filepath.Join(appRoot, "Contents", "Resources", "codex"),
		)
	}
	return out
}

func codexRuntimePresent() bool {
	for _, appRoot := range darwinCodexAppRoots() {
		if info, err := os.Stat(appRoot); err == nil && info.IsDir() {
			return true
		}
	}
	return false
}

func darwinCodexAppRoots() []string {
	home, _ := os.UserHomeDir()
	var roots []string
	if home != "" {
		roots = append(roots, filepath.Join(home, "Applications", "Codex.app"))
	}
	return append(roots, filepath.Join(string(filepath.Separator), "Applications", "Codex.app"))
}

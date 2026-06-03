//go:build windows

package apply

import (
	"os"
	"path/filepath"
	"strings"
)

func addWindowsCodexSearchDirs(add func(string)) {
	if appData := strings.TrimSpace(os.Getenv("APPDATA")); appData != "" {
		add(filepath.Join(appData, "npm"))
	}
}

func addDarwinCodexSearchDirs(add func(string), home string) {}

func codexClientExecutablePath(path string) bool {
	cleaned := strings.ToLower(filepath.Clean(strings.TrimSpace(path)))
	if cleaned == "" {
		return false
	}
	return strings.Contains(cleaned, strings.ToLower(filepath.Clean(filepath.Join("WindowsApps", "OpenAI.Codex_")))) ||
		strings.Contains(cleaned, strings.ToLower(filepath.Clean(filepath.Join("Packages", "OpenAI.Codex_")))) ||
		strings.Contains(cleaned, strings.ToLower(filepath.Clean(filepath.Join("Programs", "OpenAI", "Codex"))))
}

func codexExtraExecutableCandidates() []string {
	var out []string
	if localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); localAppData != "" {
		out = append(out, filepath.Join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"))
	}
	out = append(out, windowsStoreCodexExecutables()...)
	return out
}

func codexRuntimePresent() bool {
	if localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); localAppData != "" {
		root := filepath.Join(localAppData, "Programs", "OpenAI", "Codex")
		if info, err := os.Stat(root); err == nil && info.IsDir() {
			return true
		}
	}
	for _, exe := range windowsStoreCodexExecutables() {
		if codexExecutableFile(exe) {
			return true
		}
	}
	if len(windowsStoreCodexPackageDirs()) > 0 {
		return true
	}
	return false
}

func windowsStoreCodexPackageDirs() []string {
	localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if localAppData == "" {
		return nil
	}
	root := filepath.Join(localAppData, "Packages")
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var dirs []string
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "OpenAI.Codex_") {
			continue
		}
		dirs = append(dirs, filepath.Join(root, entry.Name()))
	}
	return dirs
}

func windowsStoreCodexExecutables() []string {
	var out []string
	for _, pkgDir := range windowsStoreCodexPackageDirs() {
		out = append(out, filepath.Join(pkgDir, "app", "resources", "codex.exe"))
	}
	programFiles := strings.TrimSpace(os.Getenv("ProgramFiles"))
	if programFiles == "" {
		return out
	}
	windowsApps := filepath.Join(programFiles, "WindowsApps")
	entries, err := os.ReadDir(windowsApps)
	if err != nil {
		return out
	}
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "OpenAI.Codex_") {
			continue
		}
		out = append(out, filepath.Join(windowsApps, entry.Name(), "app", "resources", "codex.exe"))
	}
	return out
}

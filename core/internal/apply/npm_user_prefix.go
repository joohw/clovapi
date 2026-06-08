package apply

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	npmUserPrefixMarkerStart = "# >>> clovapi npm-global >>>"
	npmUserPrefixMarkerEnd   = "# <<< clovapi npm-global <<<"
)

func userLevelNpmGlobalPrefix() (string, bool) {
	if runtime.GOOS == "windows" {
		return "", false
	}
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "", false
	}
	return filepath.Join(home, ".npm-global"), true
}

func npmGlobalLibDir(prefix string) string {
	return filepath.Join(strings.TrimSpace(prefix), "lib", "node_modules")
}

func npmGlobalPrefixWritable(prefix string) bool {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return false
	}
	libDir := npmGlobalLibDir(prefix)
	if err := os.MkdirAll(libDir, 0o755); err != nil {
		return false
	}
	test := filepath.Join(libDir, ".clovapi-write-test")
	if err := os.WriteFile(test, []byte("ok"), 0o644); err != nil {
		return false
	}
	_ = os.Remove(test)
	return true
}

func npmSystemGlobalPrefixWritable() bool {
	prefix, ok := npmGlobalPrefix()
	if !ok {
		return false
	}
	return npmGlobalPrefixWritable(prefix)
}

func npmGlobalInstallCandidates(pkg string) []installCandidate {
	var out []installCandidate
	if npmSystemGlobalPrefixWritable() {
		out = append(out, npmGlobalInstallCandidate(pkg))
	}
	if prefix, ok := userLevelNpmGlobalPrefix(); ok {
		out = append(out, npmGlobalInstallCandidateWithPrefix(pkg, prefix))
	}
	if len(out) == 0 {
		out = append(out, npmGlobalInstallCandidate(pkg))
	}
	return out
}

func npmGlobalInstallCandidateWithPrefix(pkg, prefix string) installCandidate {
	return installCandidate{
		Manager: "npm",
		Label:   "npm:" + pkg + " (user prefix)",
		Args:    []string{"install", "-g", "--prefix", prefix, pkg},
	}
}

func npmGlobalUninstallCandidates(pkg string) []uninstallCandidate {
	out := []uninstallCandidate{npmGlobalUninstall(pkg)}
	if prefix, ok := userLevelNpmGlobalPrefix(); ok {
		out = append(out, uninstallCandidate{
			Manager: "npm",
			Label:   "npm:" + pkg + " (user prefix)",
			Args:    []string{"uninstall", "-g", "--prefix", prefix, pkg},
		})
	}
	return out
}

func npmGlobalShimDirs() []string {
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
	if prefix, ok := npmGlobalPrefix(); ok {
		add(prefix)
	}
	if prefix, ok := userLevelNpmGlobalPrefix(); ok {
		add(prefix)
	}
	return dirs
}

func ensureUserNpmGlobalBinOnPathIfNeeded() error {
	prefix, ok := userLevelNpmGlobalPrefix()
	if !ok {
		return nil
	}
	binDir := filepath.Join(prefix, "bin")
	if info, err := os.Stat(binDir); err != nil || !info.IsDir() {
		return nil
	}
	return ensureUnixUserBinOnPath(binDir)
}

func shellProfileCandidates() []string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" || runtime.GOOS == "windows" {
		return nil
	}
	if runtime.GOOS == "darwin" {
		return []string{
			filepath.Join(home, ".zprofile"),
			filepath.Join(home, ".zshrc"),
			filepath.Join(home, ".bash_profile"),
			filepath.Join(home, ".bashrc"),
		}
	}
	return []string{
		filepath.Join(home, ".profile"),
		filepath.Join(home, ".bashrc"),
		filepath.Join(home, ".zshrc"),
	}
}

func pickShellProfile(candidates []string) string {
	for _, file := range candidates {
		if info, err := os.Stat(file); err == nil && !info.IsDir() {
			return file
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}
	return ""
}

func buildNpmGlobalPathBlock(binDir string) string {
	line := fmt.Sprintf(`export PATH="%s:$PATH"`, binDir)
	return strings.Join([]string{npmUserPrefixMarkerStart, line, npmUserPrefixMarkerEnd, ""}, "\n")
}

func upsertMarkedShellBlock(content, block string) string {
	text := content
	start := strings.Index(text, npmUserPrefixMarkerStart)
	end := strings.Index(text, npmUserPrefixMarkerEnd)
	if start >= 0 && end > start {
		before := text[:start]
		after := text[end+len(npmUserPrefixMarkerEnd):]
		prefix := before
		if len(prefix) > 0 && !strings.HasSuffix(prefix, "\n") {
			prefix += "\n"
		}
		suffix := after
		if !strings.HasPrefix(suffix, "\n") {
			suffix = "\n" + suffix
		}
		return strings.ReplaceAll(prefix+block+suffix, "\n\n\n", "\n\n")
	}
	if len(text) == 0 {
		return block
	}
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	return text + block
}

func ensureUnixUserBinOnPath(binDir string) error {
	binDir = filepath.Clean(strings.TrimSpace(binDir))
	if binDir == "" {
		return fmt.Errorf("bin dir is required")
	}
	candidates := shellProfileCandidates()
	target := pickShellProfile(candidates)
	if target == "" {
		return fmt.Errorf("no shell profile target")
	}

	existing := ""
	if data, err := os.ReadFile(target); err == nil {
		existing = string(data)
	} else if !os.IsNotExist(err) {
		return err
	}
	if strings.Contains(existing, npmUserPrefixMarkerStart) || strings.Contains(existing, binDir+":") {
		return nil
	}

	block := buildNpmGlobalPathBlock(binDir)
	next := upsertMarkedShellBlock(existing, block)
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, []byte(next), 0o600)
}

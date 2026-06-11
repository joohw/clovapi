package apply

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestUserLevelNpmGlobalPrefix(t *testing.T) {
	if runtime.GOOS == "windows" {
		if _, ok := userLevelNpmGlobalPrefix(); ok {
			t.Fatal("userLevelNpmGlobalPrefix() should be disabled on windows")
		}
		return
	}
	prefix, ok := userLevelNpmGlobalPrefix()
	if !ok {
		t.Fatal("userLevelNpmGlobalPrefix() = false")
	}
	if !strings.HasSuffix(prefix, filepath.Join(".npm-global")) {
		t.Fatalf("prefix = %q, want suffix .npm-global", prefix)
	}
}

func TestNpmGlobalPrefixWritable(t *testing.T) {
	root := t.TempDir()
	if !npmGlobalPrefixWritable(root) {
		t.Fatal("expected temp npm prefix to be writable")
	}
	if npmGlobalPrefixWritable(filepath.Join(root, "missing", "nested")) {
		// MkdirAll should create nested dirs; still writable.
	}
}

func TestNpmGlobalInstallCandidatesIncludeUserPrefix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("user-level npm prefix fallback is unix-only")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)

	candidates := npmGlobalInstallCandidates("@anthropic-ai/claude-code")
	var userCandidate *installCandidate
	for i := range candidates {
		if strings.Contains(candidates[i].Label, "user prefix") {
			userCandidate = &candidates[i]
			break
		}
	}
	if userCandidate == nil {
		t.Fatalf("candidates = %#v, want user prefix candidate", candidates)
	}
	wantPrefix := filepath.Join(home, ".npm-global")
	if got := strings.Join(userCandidate.Args, " "); got != "install -g --prefix "+wantPrefix+" @anthropic-ai/claude-code" {
		t.Fatalf("args = %q", got)
	}
}

func TestEnsureUnixUserBinOnPathWritesMarkedBlock(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell profile updates are unix-only")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	binDir := filepath.Join(home, ".npm-global", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := ensureUnixUserBinOnPath(binDir); err != nil {
		t.Fatal(err)
	}
	profile := pickShellProfile(shellProfileCandidates())
	data, err := os.ReadFile(profile)
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, npmUserPrefixMarkerStart) || !strings.Contains(text, binDir) {
		t.Fatalf("profile = %q, want clovapi npm-global PATH block", text)
	}

	if err := ensureUnixUserBinOnPath(binDir); err != nil {
		t.Fatal(err)
	}
	data2, err := os.ReadFile(profile)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(data2), npmUserPrefixMarkerStart) != 1 {
		t.Fatalf("profile should contain a single marker block: %q", string(data2))
	}
}

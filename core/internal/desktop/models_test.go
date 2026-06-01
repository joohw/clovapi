package desktop

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/provider"
)

func TestAuthStatusCodexLoggedInWithoutCLIInstalled(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "clovapi")
	config.SetDirOverride(configDir)
	t.Cleanup(func() { config.SetDirOverride("") })

	subDir := filepath.Join(configDir, "subscription")
	if err := os.MkdirAll(subDir, 0o700); err != nil {
		t.Fatal(err)
	}
	authBody := `{
  "auth_mode": "chatgpt",
  "tokens": {
    "access_token": "test-access-token",
    "account_id": "acct-123"
  }
}`
	if err := os.WriteFile(filepath.Join(subDir, "codex.json"), []byte(authBody), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("HOME", root)
	t.Setenv("USERPROFILE", root)
	t.Setenv("PATH", root)
	t.Setenv("LOCALAPPDATA", filepath.Join(root, "LocalAppData"))
	t.Setenv("APPDATA", filepath.Join(root, "AppData"))
	t.Setenv("ProgramFiles", filepath.Join(root, "ProgramFiles"))

	result := AuthStatus()
	var codexItem *AuthStatusItem
	for i := range result.Items {
		if result.Items[i].ID == provider.CodexProviderID {
			codexItem = &result.Items[i]
			break
		}
	}
	if codexItem == nil {
		t.Fatal("codex auth status item not found")
	}
	if codexItem.Installed {
		t.Fatal("expected codex to be reported as not installed in isolated env")
	}
	if !codexItem.LoggedIn {
		t.Fatalf("expected logged in from clovapi OAuth store without codex CLI; summary=%q", codexItem.Summary)
	}
	if !codexItem.Active {
		t.Fatal("expected active codex subscription when logged in")
	}
}

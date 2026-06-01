package desktop

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
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

func TestParseOpenAIModelsUsesDisplayName(t *testing.T) {
	models, err := parseOpenAIModels([]byte(`{
		"data": [
			{"id": "claude-opus-4-8", "display_name": "Claude Opus 4.8"},
			{"id": "gpt-5.4", "displayName": "GPT-5.4"}
		]
	}`), string(apistyle.OpenAIResponses))
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(models))
	}
	if models[0].Label != "Claude Opus 4.8" {
		t.Fatalf("expected display_name label, got %q", models[0].Label)
	}
	if models[1].Label != "GPT-5.4" {
		t.Fatalf("expected displayName label, got %q", models[1].Label)
	}
}

func TestNormalizeClaudeSubscriptionModelLabels(t *testing.T) {
	models := normalizeClaudeSubscriptionModelLabels(parseTestModels(t, `{
		"data": [
			{"id": "claude-opus-4-8"},
			{"id": "claude-haiku-4-5-20251001"},
			{"id": "claude-3-5-sonnet-20241022"},
			{"id": "claude-sonnet-4-6", "display_name": "Official Sonnet"}
		]
	}`))
	want := []string{"Claude Opus 4.8", "Claude Haiku 4.5", "Claude Sonnet 3.5", "Official Sonnet"}
	for i, expected := range want {
		if models[i].Label != expected {
			t.Fatalf("model %d label = %q, want %q", i, models[i].Label, expected)
		}
	}
}

func TestParseCodexSubscriptionModelsSupportsCurrentShapes(t *testing.T) {
	models, err := parseCodexSubscriptionModels([]byte(`{
		"result": {
			"data": [
				{"model": "gpt-5.5", "displayName": "GPT-5.5"},
				{"slug": "gpt-hidden", "hidden": true},
				{"id": "gpt-disabled", "supported_in_api": false}
			]
		}
	}`), string(apistyle.OpenAIResponses))
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 {
		t.Fatalf("expected 1 visible model, got %d", len(models))
	}
	if models[0].ID != "gpt-5.5" || models[0].Model != "gpt-5.5" {
		t.Fatalf("expected gpt-5.5 model, got id=%q model=%q", models[0].ID, models[0].Model)
	}
	if models[0].Label != "GPT-5.5" {
		t.Fatalf("expected displayName label, got %q", models[0].Label)
	}
	if models[0].APIStyle != apistyle.OpenAIResponses {
		t.Fatalf("expected openai-responses api style, got %q", models[0].APIStyle)
	}
}

func parseTestModels(t *testing.T, body string) []profile.Model {
	t.Helper()
	models, err := parseOpenAIModels([]byte(body), string(apistyle.Claude))
	if err != nil {
		t.Fatal(err)
	}
	return models
}

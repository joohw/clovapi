package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestListModelsUsesPublicModelIDsOnly(t *testing.T) {
	root := t.TempDir()
	config.SetDirOverride(filepath.Join(root, "clovapi"))
	t.Cleanup(func() { config.SetDirOverride("") })

	if err := profile.Save(&profile.Store{
		Version: profile.StoreVersion,
		Proxy:   profile.ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 28888},
		List: []profile.Profile{
			{
				Name:         profile.CustomAPIProfileName,
				Kind:         "api",
				ModelAdapter: "manual",
				Models: []profile.Model{{
					ID:       "public-gpt",
					Label:    "Public GPT",
					Model:    "upstream-secret-model",
					APIStyle: apistyle.OpenAIResponses,
					BaseURL:  "https://upstream.example/v1",
					APIKey:   "secret-key",
				}},
			},
		},
	}); err != nil {
		t.Fatal(err)
	}

	result := ListModels()
	if !result.OK {
		t.Fatalf("ListModels failed: %s", result.Error)
	}
	if len(result.Models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(result.Models))
	}
	item := result.Models[0]
	if item.ProviderID != provider.CustomAPIProviderID || item.ModelID != "public-gpt" {
		t.Fatalf("unexpected model item: %+v", item)
	}
	if item.ProxyBaseURL != "http://127.0.0.1:28888/custom-api/v1" {
		t.Fatalf("proxy base URL = %q", item.ProxyBaseURL)
	}
	body, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	for _, forbidden := range []string{"upstream-secret-model", "upstream.example", "secret-key"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("ListModels leaked %q in %s", forbidden, text)
		}
	}
}

func TestListModelsHidesUnavailableOllamaAndSubscriptions(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "clovapi")
	config.SetDirOverride(configDir)
	t.Cleanup(func() { config.SetDirOverride("") })
	t.Setenv("PATH", root)
	t.Setenv("HOME", root)
	t.Setenv("USERPROFILE", root)
	t.Setenv("LOCALAPPDATA", filepath.Join(root, "LocalAppData"))
	t.Setenv("APPDATA", filepath.Join(root, "AppData"))
	t.Setenv("ProgramFiles", filepath.Join(root, "ProgramFiles"))

	if err := profile.Save(&profile.Store{
		Version: profile.StoreVersion,
		Proxy:   profile.ProxyConfig{Enabled: true, Host: "0.0.0.0", Port: 27483},
		List: []profile.Profile{
			{
				Name:          provider.OllamaVendorName,
				Kind:          "local",
				LocalProvider: "ollama",
				ModelAdapter:  "ollama",
				Models: []profile.Model{{
					ID:       "llama3.2",
					Label:    "llama3.2",
					Model:    "llama3.2",
					APIStyle: apistyle.OpenAIChat,
				}},
			},
			{
				Name:                   provider.CodexVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.CodexProviderID,
				ModelAdapter:           "subscription",
				Models: []profile.Model{{
					ID:       "gpt-5",
					Label:    "GPT-5",
					Model:    "gpt-5",
					APIStyle: apistyle.OpenAIResponses,
				}},
			},
			{
				Name:         profile.CustomAPIProfileName,
				Kind:         "api",
				ModelAdapter: "manual",
				Models: []profile.Model{{
					ID:       "public-gpt",
					Label:    "Public GPT",
					Model:    "upstream-secret-model",
					APIStyle: apistyle.OpenAIResponses,
				}},
			},
		},
	}); err != nil {
		t.Fatal(err)
	}

	result := ListModels()
	if !result.OK {
		t.Fatalf("ListModels failed: %s", result.Error)
	}
	if len(result.Models) != 1 {
		t.Fatalf("expected only custom API model, got %+v", result.Models)
	}
	if result.Models[0].ProviderID != provider.CustomAPIProviderID {
		t.Fatalf("unexpected model item: %+v", result.Models[0])
	}
}

func TestAuthStatusCodexLoggedIn(t *testing.T) {
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
	if !codexItem.LoggedIn {
		t.Fatalf("expected logged in from clovapi OAuth store; summary=%q", codexItem.Summary)
	}
	if !codexItem.Active {
		t.Fatal("expected active codex subscription when logged in")
	}
}

func TestSummarizeAuthStatusOmitsLoggedInPrefixForPlans(t *testing.T) {
	claudeData := map[string]any{
		"claudeAiOauth": map[string]any{"subscriptionType": "Pro"},
	}
	if got := summarizeAuthStatus(provider.ClaudeCodeProviderID, true, claudeData); got != "Pro" {
		t.Fatalf("claude summary = %q want Pro", got)
	}

	codexData := map[string]any{"auth_mode": "chatgpt"}
	if got := summarizeAuthStatus(provider.CodexProviderID, true, codexData); got != "Logged in" {
		t.Fatalf("codex summary = %q want Logged in", got)
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

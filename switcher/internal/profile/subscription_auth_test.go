package profile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/provider"
)

func TestProfileForModelBindingClaudeSubscriptionFromAuthFile(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o700); err != nil {
		t.Fatal(err)
	}
	credsPath := filepath.Join(claudeDir, ".credentials.json")
	if err := os.WriteFile(credsPath, []byte(`{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat-test-token",
    "expiresAt": 9999999999999
  }
}`), 0o600); err != nil {
		t.Fatal(err)
	}

	SetClaudeCredentialsPathOverride(credsPath)
	t.Cleanup(func() { SetClaudeCredentialsPathOverride("") })

	s := &Store{
		List: []Profile{{
			Name:                   provider.ClaudeCodeVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.ClaudeCodeProviderID,
			APIStyle:               apistyle.Claude,
			Models: []Model{{
				ID:       "claude-sonnet-4-6",
				Model:    "claude-sonnet-4-6",
				APIStyle: apistyle.Claude,
			}},
		}},
	}

	binding := provider.ModelBindingForProvider(provider.ClaudeCodeProviderID, "claude-sonnet-4-6")
	p, ok := s.ProfileForModelBinding(binding)
	if !ok {
		t.Fatal("expected claude subscription binding to resolve from auth file")
	}
	if p.BaseURL != anthropicOAuthBaseURL {
		t.Fatalf("base_url = %q want %q", p.BaseURL, anthropicOAuthBaseURL)
	}
	if p.APIKey != "sk-ant-oat-test-token" {
		t.Fatalf("api_key = %q", p.APIKey)
	}
	if p.Model != "claude-sonnet-4-6" || p.APIStyle != apistyle.Claude {
		t.Fatalf("resolved profile = %+v", p)
	}
}

func TestProfileForModelBindingClaudeSubscriptionMissingAuth(t *testing.T) {
	SetClaudeCredentialsPathOverride(filepath.Join(t.TempDir(), "missing.json"))
	t.Cleanup(func() { SetClaudeCredentialsPathOverride("") })

	s := &Store{
		List: []Profile{{
			Name:                   provider.ClaudeCodeVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.ClaudeCodeProviderID,
			APIStyle:               apistyle.Claude,
			Models: []Model{{
				ID:    "claude-sonnet-4-6",
				Model: "claude-sonnet-4-6",
			}},
		}},
	}
	binding := provider.ModelBindingForProvider(provider.ClaudeCodeProviderID, "claude-sonnet-4-6")
	if _, ok := s.ProfileForModelBinding(binding); ok {
		t.Fatal("expected unresolved binding without auth file")
	}
}

func TestProfileForModelBindingCodexSubscriptionFromAuthFile(t *testing.T) {
	dir := t.TempDir()
	authPath := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authPath, []byte(`{
  "tokens": {
    "access_token": "codex-oauth-token",
    "account_id": "chatgpt-acct-1"
  }
}`), 0o600); err != nil {
		t.Fatal(err)
	}

	SetCodexHomeOverride(dir)
	t.Cleanup(func() { SetCodexHomeOverride("") })

	s := &Store{
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			Models: []Model{{
				ID:    "gpt-5.4",
				Model: "gpt-5.4",
			}},
		}},
	}

	binding := provider.ModelBindingForProvider(provider.CodexProviderID, "gpt-5.4")
	p, ok := s.ProfileForModelBinding(binding)
	if !ok {
		t.Fatal("expected codex subscription binding to resolve from auth file")
	}
	if p.BaseURL != codexBackendBaseURL || p.APIKey != "codex-oauth-token" {
		t.Fatalf("resolved profile = %+v", p)
	}
	if p.AccountID != "chatgpt-acct-1" {
		t.Fatalf("account_id = %q", p.AccountID)
	}
}

func TestProfileForModelBindingCodexSubscriptionMissingAccountID(t *testing.T) {
	dir := t.TempDir()
	authPath := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authPath, []byte(`{
  "tokens": {
    "access_token": "codex-oauth-token"
  }
}`), 0o600); err != nil {
		t.Fatal(err)
	}

	SetCodexHomeOverride(dir)
	t.Cleanup(func() { SetCodexHomeOverride("") })

	s := &Store{
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			Models: []Model{{
				ID:    "gpt-5.4",
				Model: "gpt-5.4",
			}},
		}},
	}
	binding := provider.ModelBindingForProvider(provider.CodexProviderID, "gpt-5.4")
	if _, ok := s.ProfileForModelBinding(binding); ok {
		t.Fatal("expected unresolved binding without account_id")
	}
}

func TestCodexAccountIDFromAccessTokenJWT(t *testing.T) {
	// payload: {"https://api.openai.com/auth":{"chatgpt_account_id":"jwt-acct"}}
	token := "eyJhbGciOiJub25lIn0.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiand0LWFjY3QifX0."
	dir := t.TempDir()
	authPath := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authPath, []byte(`{
  "tokens": {
    "access_token": "`+token+`"
  }
}`), 0o600); err != nil {
		t.Fatal(err)
	}
	SetCodexHomeOverride(dir)
	t.Cleanup(func() { SetCodexHomeOverride("") })

	s := &Store{
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			Models: []Model{{
				ID:    "gpt-5.4",
				Model: "gpt-5.4",
			}},
		}},
	}
	binding := provider.ModelBindingForProvider(provider.CodexProviderID, "gpt-5.4")
	p, ok := s.ProfileForModelBinding(binding)
	if !ok {
		t.Fatal("expected binding to resolve account_id from JWT")
	}
	if p.AccountID != "jwt-acct" {
		t.Fatalf("account_id = %q want jwt-acct", p.AccountID)
	}
}

func TestProfileForModelBindingPrefersProfilesJSONCredentials(t *testing.T) {
	s := &Store{
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			BaseURL:                "https://persisted.example/v1",
			APIKey:                 "persisted-key",
			APIStyle:               apistyle.OpenAIResponses,
			Models: []Model{{
				ID:    "gpt-5.4",
				Model: "gpt-5.4",
			}},
		}},
	}
	binding := provider.ModelBindingForProvider(provider.CodexProviderID, "gpt-5.4")
	p, ok := s.ProfileForModelBinding(binding)
	if !ok {
		t.Fatal("expected binding to resolve from profiles.json")
	}
	if p.BaseURL != "https://persisted.example/v1" || p.APIKey != "persisted-key" {
		t.Fatalf("should keep persisted credentials: %+v", p)
	}
}

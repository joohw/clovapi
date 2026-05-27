package cliswitch

import (
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestCodexCanResolveClaudeSubscriptionSelection(t *testing.T) {
	s := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.ClaudeCodeVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.ClaudeCodeProviderID,
			APIStyle:               apistyle.Claude,
			Models: []profile.Model{{
				ID:       "claude-sonnet-4-6",
				Model:    "claude-sonnet-4-6",
				APIStyle: apistyle.Claude,
			}},
		}},
	}

	selection, err := ResolveSelection(s, agentkind.Codex, provider.ClaudeCodeVendorName, "claude-sonnet-4-6")
	if err != nil {
		t.Fatal(err)
	}
	if selection.ProviderID != provider.ClaudeCodeProviderID || selection.ModelID != "claude-sonnet-4-6" {
		t.Fatalf("selection = %+v", selection)
	}
}

func TestMultiStyleCLIsUsePreferredIngressForCodexSubscription(t *testing.T) {
	hit := profile.VendorModelHit{
		Vendor: profile.Profile{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
		},
		Model: profile.Model{
			ID:       "gpt-5.4",
			Model:    "gpt-5.4",
			APIStyle: apistyle.OpenAIResponses,
		},
	}
	if got := profile.IngressStyleForCLI(agentkind.OpenCode, hit); got != apistyle.Claude {
		t.Fatalf("opencode codex ingress = %s, want %s", got, apistyle.Claude)
	}
	if got := profile.IngressStyleForCLI(agentkind.KimiCode, hit); got != apistyle.Claude {
		t.Fatalf("kimi codex ingress = %s, want %s", got, apistyle.Claude)
	}
}

func TestKimiCanResolveOpenAICompatibleCustomModel(t *testing.T) {
	s := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.OpenAIResponses,
			BaseURL:  "https://example.test/v1",
			APIKey:   "sk-test",
			Models: []profile.Model{{
				ID:       "gpt-5.4-mini",
				Model:    "gpt-5.4-mini",
				APIStyle: apistyle.OpenAIResponses,
			}},
		}},
	}

	selection, err := ResolveSelection(s, agentkind.KimiCode, provider.CustomAPIVendorName, "gpt-5.4-mini")
	if err != nil {
		t.Fatal(err)
	}
	if selection.ProviderID != provider.CustomAPIProviderID || selection.ModelID != "gpt-5.4-mini" {
		t.Fatalf("selection = %+v", selection)
	}
}

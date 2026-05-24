package desktop

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestResolveProbeStylesUsesCliIngressForCrossSubscription(t *testing.T) {
	vendor := profile.Profile{
		Name:                   provider.ClaudeCodeVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.ClaudeCodeProviderID,
		ModelAdapter:           "subscription",
	}
	model := profile.Model{ID: "claude-sonnet-4-6", Model: "claude-sonnet-4-6", APIStyle: apistyle.Claude}

	ingress, probe, err := resolveProbeStyles(provider.ClaudeCodeProviderID, "codex", vendor, model)
	if err != nil {
		t.Fatal(err)
	}
	if ingress != "openai-responses" {
		t.Fatalf("ingress = %q, want openai-responses", ingress)
	}
	if probe != apistyle.OpenAIResponses {
		t.Fatalf("probe = %q, want openai-responses", probe)
	}

	vendor = profile.Profile{
		Name:                   provider.CodexVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		ModelAdapter:           "subscription",
	}
	model = profile.Model{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses}
	ingress, probe, err = resolveProbeStyles(provider.CodexProviderID, "claude-code", vendor, model)
	if err != nil {
		t.Fatal(err)
	}
	if ingress != "claude" {
		t.Fatalf("ingress = %q, want claude", ingress)
	}
	if probe != apistyle.Claude {
		t.Fatalf("probe = %q, want claude", probe)
	}
}

func TestResolveProbeStylesKimiCodeCrossSubscription(t *testing.T) {
	claudeVendor := profile.Profile{
		Name:                   provider.ClaudeCodeVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.ClaudeCodeProviderID,
		ModelAdapter:           "subscription",
	}
	claudeModel := profile.Model{ID: "claude-sonnet-4-6", Model: "claude-sonnet-4-6", APIStyle: apistyle.Claude}

	ingress, probe, err := resolveProbeStyles(provider.ClaudeCodeProviderID, string(clikind.KimiCode), claudeVendor, claudeModel)
	if err != nil {
		t.Fatal(err)
	}
	if ingress != "claude" {
		t.Fatalf("kimi claude ingress = %q, want claude", ingress)
	}
	if probe != apistyle.Claude {
		t.Fatalf("kimi claude probe = %q, want claude", probe)
	}

	codexVendor := profile.Profile{
		Name:                   provider.CodexVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		ModelAdapter:           "subscription",
	}
	codexModel := profile.Model{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses}

	ingress, probe, err = resolveProbeStyles(provider.CodexProviderID, string(clikind.KimiCode), codexVendor, codexModel)
	if err != nil {
		t.Fatal(err)
	}
	if ingress != "claude" {
		t.Fatalf("kimi codex ingress = %q, want claude", ingress)
	}
	if probe != apistyle.Claude {
		t.Fatalf("kimi codex probe = %q, want claude", probe)
	}
}

package desktop

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestResolveProbeStylesUsesCliIngressForCrossSubscription(t *testing.T) {
	claudeVendor := profile.Profile{
		Name:                   provider.ClaudeCodeVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.ClaudeCodeProviderID,
		ModelAdapter:           "subscription",
	}
	claudeModel := profile.Model{ID: "claude-sonnet-4-6", Model: "claude-sonnet-4-6", APIStyle: apistyle.Claude}
	claudeHit := profile.VendorModelHit{Vendor: claudeVendor, Model: claudeModel}

	ingress, probe := resolveProbeStyles(clikind.Codex, claudeHit)
	if ingress != "openai-responses" {
		t.Fatalf("ingress = %q, want openai-responses", ingress)
	}
	if probe != apistyle.OpenAIResponses {
		t.Fatalf("probe = %q, want openai-responses", probe)
	}

	codexVendor := profile.Profile{
		Name:                   provider.CodexVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		ModelAdapter:           "subscription",
	}
	codexModel := profile.Model{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses}
	codexHit := profile.VendorModelHit{Vendor: codexVendor, Model: codexModel}

	ingress, probe = resolveProbeStyles(clikind.ClaudeCode, codexHit)
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
	claudeHit := profile.VendorModelHit{Vendor: claudeVendor, Model: claudeModel}

	ingress, probe := resolveProbeStyles(clikind.KimiCode, claudeHit)
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
	codexHit := profile.VendorModelHit{Vendor: codexVendor, Model: codexModel}

	ingress, probe = resolveProbeStyles(clikind.KimiCode, codexHit)
	if ingress != "claude" {
		t.Fatalf("kimi codex ingress = %q, want claude", ingress)
	}
	if probe != apistyle.Claude {
		t.Fatalf("kimi codex probe = %q, want claude", probe)
	}
}

func TestResolveProbeStylesHermesCodexUsesResponses(t *testing.T) {
	codexVendor := profile.Profile{
		Name:                   provider.CodexVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		ModelAdapter:           "subscription",
	}
	codexModel := profile.Model{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses}
	codexHit := profile.VendorModelHit{Vendor: codexVendor, Model: codexModel}

	ingress, probe := resolveProbeStyles(clikind.Hermes, codexHit)
	if ingress != "openai-responses" {
		t.Fatalf("hermes codex ingress = %q, want openai-responses", ingress)
	}
	if probe != apistyle.OpenAIResponses {
		t.Fatalf("hermes codex probe = %q, want openai-responses", probe)
	}
}

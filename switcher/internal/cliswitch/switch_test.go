package cliswitch

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestParseTarget(t *testing.T) {
	v, m, b, ok := ParseTarget("@model:Codex Subscription/gpt-5.5")
	if !ok || v != "Codex Subscription" || m != "gpt-5.5" || b != "@model:Codex Subscription/gpt-5.5" {
		t.Fatalf("binding: ok=%v v=%q m=%q b=%q", ok, v, m, b)
	}
	v, m, b, ok = ParseTarget("Codex Subscription/gpt-5.4")
	if !ok || v != "Codex Subscription" || m != "gpt-5.4" || b != "@model:Codex Subscription/gpt-5.4" {
		t.Fatalf("slash: ok=%v v=%q m=%q b=%q", ok, v, m, b)
	}
}

func TestResolveBinding(t *testing.T) {
	s := &profile.Store{
		List: []profile.Profile{
			{
				Name:                   provider.CodexVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.CodexProviderID,
				BaseURL:                "https://chatgpt.com/backend-api",
				APIKey:                 "token",
				Models: []profile.Model{
					{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses},
				},
			},
		},
	}
	binding, err := ResolveBinding(s, clikind.Codex, provider.CodexVendorName, "gpt-5.4")
	if err != nil || binding != "@model:Codex Subscription/gpt-5.4" {
		t.Fatalf("resolve: binding=%q err=%v", binding, err)
	}
	if _, err := ResolveBinding(s, clikind.ClaudeCode, provider.CodexVendorName, "gpt-5.4"); err == nil {
		t.Fatal("expected codex vendor incompatible with claude-code")
	}
}

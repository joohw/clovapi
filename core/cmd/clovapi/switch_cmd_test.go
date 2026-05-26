package main

import (
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestResolveSwitchBindingOrError(t *testing.T) {
	s := &profile.Store{
		List: []profile.Profile{
			{
				Name:                   provider.CodexVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.CodexProviderID,
				BaseURL:                "https://chatgpt.com/backend-api",
				APIKey:                 "token",
				Models: []profile.Model{
					{ID: "gpt-5.5", Model: "gpt-5.5", APIStyle: apistyle.OpenAIResponses},
				},
			},
		},
	}
	binding, err := resolveSwitchBindingOrError(s, clikind.Codex, provider.CodexVendorName, "gpt-5.5", "", "")
	if err != nil || binding != "@model:Codex Subscription/gpt-5.5" {
		t.Fatalf("flags: binding=%q err=%v", binding, err)
	}
	binding, err = resolveSwitchBindingOrError(s, clikind.Codex, "", "", "", "Codex Subscription/gpt-5.5")
	if err != nil || binding != "@model:Codex Subscription/gpt-5.5" {
		t.Fatalf("positional: binding=%q err=%v", binding, err)
	}
	binding, err = resolveSwitchBindingOrError(s, clikind.Codex, provider.CodexVendorName, "", "", "")
	if err != nil || binding != "" {
		t.Fatalf("vendor-only: binding=%q err=%v", binding, err)
	}
}

func TestPromptModelForVendorSelection(t *testing.T) {
	s := &profile.Store{
		List: []profile.Profile{
			{
				Name:                   provider.CodexVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.CodexProviderID,
				Models: []profile.Model{
					{ID: "gpt-5.4", Label: "GPT 5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses},
					{ID: "gpt-5.5", Label: "GPT 5.5", Model: "gpt-5.5", APIStyle: apistyle.OpenAIResponses},
				},
			},
		},
	}
	vendor, ok := profile.FindStoreVendorProfile(s, provider.CodexVendorName)
	if !ok {
		t.Fatal("vendor missing")
	}
	sc := switchScannerFrom(strings.NewReader("2\n"))
	picked, err := promptModelForVendor(sc, clikind.Codex, s, vendor, "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if picked.binding != "@model:Codex Subscription/gpt-5.5" {
		t.Fatalf("binding=%q", picked.binding)
	}
}

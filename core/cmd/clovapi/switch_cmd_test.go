package main

import (
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestResolveSwitchSelectionOrError(t *testing.T) {
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
	selection, err := resolveSwitchSelectionOrError(s, agentkind.Codex, "", provider.CodexVendorName, "gpt-5.5", "", "")
	if err != nil || selection.ProviderID != provider.CodexProviderID || selection.ModelID != "gpt-5.5" {
		t.Fatalf("flags: selection=%+v err=%v", selection, err)
	}
	selection, err = resolveSwitchSelectionOrError(s, agentkind.Codex, "", "", "", "", "Codex Subscription/gpt-5.5")
	if err != nil || selection.ProviderID != provider.CodexProviderID || selection.ModelID != "gpt-5.5" {
		t.Fatalf("positional: selection=%+v err=%v", selection, err)
	}
	selection, err = resolveSwitchSelectionOrError(s, agentkind.Codex, "", provider.CodexVendorName, "", "", "")
	if err != nil || selection.ProviderID != "" {
		t.Fatalf("vendor-only: selection=%+v err=%v", selection, err)
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
	picked, err := promptModelForVendor(sc, agentkind.Codex, s, vendor, "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if picked.selection.ProviderID != provider.CodexProviderID || picked.selection.ModelID != "gpt-5.5" {
		t.Fatalf("selection=%+v", picked.selection)
	}
}

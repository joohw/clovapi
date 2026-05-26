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

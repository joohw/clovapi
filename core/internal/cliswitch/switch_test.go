package cliswitch

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestCodexCanResolveClaudeSubscriptionBinding(t *testing.T) {
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

	binding, err := ResolveBinding(s, clikind.Codex, provider.ClaudeCodeVendorName, "claude-sonnet-4-6")
	if err != nil {
		t.Fatal(err)
	}
	if want := "@model:Claude Subscription/claude-sonnet-4-6"; binding != want {
		t.Fatalf("binding = %q want %q", binding, want)
	}
}

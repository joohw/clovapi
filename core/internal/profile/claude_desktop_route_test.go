package profile

import (
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
)

func TestClaudeDesktopRouteNameAnthropicPassthrough(t *testing.T) {
	got := ClaudeDesktopRouteName("claude-sonnet-4-6", 0)
	if got != "claude-sonnet-4-6" {
		t.Fatalf("route = %q", got)
	}
}

func TestClaudeDesktopRouteNameMapsNonAnthropicWire(t *testing.T) {
	got := ClaudeDesktopRouteName("gpt-5.5", 0)
	if got != "claude-sonnet-4-6" {
		t.Fatalf("route = %q want claude-sonnet-4-6", got)
	}
	got = ClaudeDesktopRouteName("gpt-5.4", 1)
	if got != "claude-sonnet-4-5" {
		t.Fatalf("route = %q want claude-sonnet-4-5", got)
	}
}

func TestResolveModelIDFromClaudeDesktopRoute(t *testing.T) {
	store := &Store{
		List: []Profile{{
			Name:                   "Codex Subscription",
			Kind:                   "subscription",
			SubscriptionProviderID: "codex",
			Models: []Model{
				{ID: "gpt-5.5", Model: "gpt-5.5"},
				{ID: "gpt-5.4", Model: "gpt-5.4"},
			},
		}},
	}
	id, ok := ResolveModelIDFromClaudeDesktopRoute(store, "codex", "claude-sonnet-4-6")
	if !ok || id != "gpt-5.5" {
		t.Fatalf("resolve = %q ok=%v", id, ok)
	}
	id, ok = ResolveModelIDFromClaudeDesktopRoute(store, "codex", "claude-sonnet-4-5")
	if !ok || id != "gpt-5.4" {
		t.Fatalf("resolve = %q ok=%v", id, ok)
	}
}

func TestResolveIngressModelIDUsesActiveClaudeDesktopBinding(t *testing.T) {
	store := &Store{
		Active: map[string]ActiveSelection{
			string(agentkind.ClaudeDesktop): {ProviderID: "codex", ModelID: "gpt-5.5"},
		},
		List: []Profile{{
			Name:                   "Codex Subscription",
			Kind:                   "subscription",
			SubscriptionProviderID: "codex",
			Models:                 []Model{{ID: "gpt-5.5", Model: "gpt-5.5"}},
		}},
	}
	got := ResolveIngressModelID(store, "codex", "claude-sonnet-4-6")
	if got != "gpt-5.5" {
		t.Fatalf("model = %q want gpt-5.5", got)
	}
}

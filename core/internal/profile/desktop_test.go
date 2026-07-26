package profile

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/provider"
)

func TestMergeVendorModelsRefreshesRawIDLabel(t *testing.T) {
	merged := MergeVendorModels([]Model{
		{
			ID:       "claude-opus-4-8",
			Label:    "claude-opus-4-8",
			Model:    "claude-opus-4-8",
			APIStyle: apistyle.Claude,
		},
	}, []Model{
		{
			ID:       "claude-opus-4-8",
			Label:    "Claude Opus 4.8",
			Model:    "claude-opus-4-8",
			APIStyle: apistyle.Claude,
		},
	})
	if len(merged) != 1 {
		t.Fatalf("expected 1 merged model, got %d", len(merged))
	}
	if merged[0].Label != "Claude Opus 4.8" {
		t.Fatalf("expected refreshed label, got %q", merged[0].Label)
	}
}

func TestReplaceVendorModelsDropsMissingModels(t *testing.T) {
	replaced := ReplaceVendorModels([]Model{{
		ID:    "current",
		Label: "Current",
		Model: "current",
	}})
	if len(replaced) != 1 || replaced[0].ID != "current" {
		t.Fatalf("replaced models = %+v", replaced)
	}
}

func TestEnsureDefaultSubscriptionAccountsAddsCompatibilityAccounts(t *testing.T) {
	store := &Store{
		Version: StoreVersion,
		List: []Profile{
			{
				Name:                   provider.CodexVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.CodexProviderID,
				Models: []Model{{
					ID:    "gpt-5",
					Model: "gpt-5",
				}},
			},
			{
				Name:                   provider.ClaudeCodeVendorName,
				Kind:                   "subscription",
				SubscriptionProviderID: provider.ClaudeCodeProviderID,
				Models: []Model{{
					ID:    "claude-sonnet",
					Model: "claude-sonnet",
				}},
			},
		},
	}

	if !EnsureDefaultSubscriptionAccounts(store) {
		t.Fatal("expected compatibility accounts to be added")
	}
	if len(store.Subscriptions) != 2 {
		t.Fatalf("subscriptions len = %d, want 2", len(store.Subscriptions))
	}
	if store.Subscriptions[0].ID != DefaultCodexSubscriptionAccountID {
		t.Fatalf("first account id = %q", store.Subscriptions[0].ID)
	}
	if store.Subscriptions[1].ID != DefaultClaudeSubscriptionAccountID {
		t.Fatalf("second account id = %q", store.Subscriptions[1].ID)
	}
	if EnsureDefaultSubscriptionAccounts(store) {
		t.Fatal("second ensure should not modify store")
	}
}

func TestEnsureDefaultSubscriptionAccountsSkipsEmptySubscriptionVendors(t *testing.T) {
	store := &Store{
		Version: StoreVersion,
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			Models: []Model{{
				ID:    "default",
				Model: "default",
			}},
		}},
	}
	if EnsureDefaultSubscriptionAccounts(store) {
		t.Fatal("empty/placeholder subscription vendor should not add compatibility account")
	}
	if len(store.Subscriptions) != 0 {
		t.Fatalf("subscriptions len = %d, want 0", len(store.Subscriptions))
	}
}

func TestEnsureDefaultSubscriptionAccountsPrunesEmptyDefaultAccounts(t *testing.T) {
	store := &Store{
		Version: StoreVersion,
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
		}},
		Subscriptions: []SubscriptionAccount{{
			ID:         DefaultCodexSubscriptionAccountID,
			ProviderID: provider.CodexProviderID,
			Label:      provider.CodexVendorName,
		}},
	}
	if !EnsureDefaultSubscriptionAccounts(store) {
		t.Fatal("expected stale default account to be pruned")
	}
	if len(store.Subscriptions) != 0 {
		t.Fatalf("subscriptions len = %d, want 0", len(store.Subscriptions))
	}
}

func TestDerivedRouteBackendsIncludesProfileAndSubscriptionAccountModels(t *testing.T) {
	enabled := true
	store := &Store{
		Version: StoreVersion,
		List: []Profile{
			{
				Name:         CustomAPIProfileName,
				Kind:         "api",
				ModelAdapter: "manual",
				Models: []Model{{
					ID:       "gpt-5.5",
					Model:    "gpt-5.5",
					APIStyle: apistyle.OpenAIResponses,
				}},
			},
		},
		Subscriptions: []SubscriptionAccount{{
			ID:         "codex-team",
			ProviderID: provider.CodexProviderID,
			Label:      "Codex Team",
			Models: []Model{{
				ID:       "gpt-5.5",
				Model:    "gpt-5.5",
				APIStyle: apistyle.OpenAIResponses,
			}},
		}},
		RouteBackends: []RouteBackend{{
			ID:       "subscription__codex-team__codex__gpt-5.5",
			Enabled:  &enabled,
			Priority: 10,
			Weight:   2,
		}},
	}

	backends := store.DerivedRouteBackends()
	if len(backends) != 2 {
		t.Fatalf("backends len = %d, want 2: %+v", len(backends), backends)
	}
	gotSubscription := backends[0]
	if gotSubscription.SourceType != "subscription" ||
		gotSubscription.SourceID != "codex-team" ||
		gotSubscription.Priority != 10 ||
		gotSubscription.Weight != 2 {
		t.Fatalf("subscription backend = %+v", gotSubscription)
	}
	gotAPI := backends[1]
	if gotAPI.SourceType != "api" ||
		gotAPI.ProviderID != provider.CustomAPIProviderID ||
		gotAPI.Priority != 100 ||
		gotAPI.Weight != 1 {
		t.Fatalf("api backend = %+v", gotAPI)
	}
}

func TestDerivedRouteBackendsSkipsCompatibilityVendorWhenAccountExists(t *testing.T) {
	model := Model{
		ID:       "gpt-5.5",
		Label:    "GPT-5.5",
		Model:    "gpt-5.5",
		APIStyle: apistyle.OpenAIResponses,
	}
	store := &Store{
		Version: StoreVersion,
		List: []Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			Models:                 []Model{model},
		}},
		Subscriptions: []SubscriptionAccount{{
			ID:         "codex-personal",
			ProviderID: provider.CodexProviderID,
			Label:      "Codex 1",
			Models:     []Model{model},
		}},
	}

	backends := store.DerivedRouteBackends()
	if len(backends) != 1 {
		t.Fatalf("backends len = %d, want 1: %+v", len(backends), backends)
	}
	if backends[0].SourceID != "codex-personal" {
		t.Fatalf("source id = %q, want codex-personal", backends[0].SourceID)
	}
}

func TestMergeVendorModelsPreservesCustomLabel(t *testing.T) {
	merged := MergeVendorModels([]Model{
		{
			ID:       "claude-opus-4-8",
			Label:    "My Opus",
			Model:    "claude-opus-4-8",
			APIStyle: apistyle.Claude,
		},
	}, []Model{
		{
			ID:       "claude-opus-4-8",
			Label:    "Claude Opus 4.8",
			Model:    "claude-opus-4-8",
			APIStyle: apistyle.Claude,
		},
	})
	if len(merged) != 1 {
		t.Fatalf("expected 1 merged model, got %d", len(merged))
	}
	if merged[0].Label != "My Opus" {
		t.Fatalf("expected custom label to be preserved, got %q", merged[0].Label)
	}
}

func TestMergeVendorModelsSortsAdvancedModelsFirst(t *testing.T) {
	merged := MergeVendorModels([]Model{
		{ID: "claude-sonnet-4-6", Label: "Claude Sonnet 4.6", Model: "claude-sonnet-4-6", APIStyle: apistyle.Claude},
		{ID: "claude-opus-4-7", Label: "Claude Opus 4.7", Model: "claude-opus-4-7", APIStyle: apistyle.Claude},
	}, []Model{
		{ID: "claude-opus-4-8", Label: "Claude Opus 4.8", Model: "claude-opus-4-8", APIStyle: apistyle.Claude},
		{ID: "claude-haiku-4-5-20251001", Label: "Claude Haiku 4.5", Model: "claude-haiku-4-5-20251001", APIStyle: apistyle.Claude},
		{ID: "claude-opus-4-5-20251101", Label: "Claude Opus 4.5", Model: "claude-opus-4-5-20251101", APIStyle: apistyle.Claude},
	})
	want := []string{
		"claude-opus-4-8",
		"claude-opus-4-7",
		"claude-sonnet-4-6",
		"claude-opus-4-5-20251101",
		"claude-haiku-4-5-20251001",
	}
	if len(merged) != len(want) {
		t.Fatalf("expected %d merged models, got %d", len(want), len(merged))
	}
	for i, expected := range want {
		if merged[i].ID != expected {
			t.Fatalf("model %d id = %q, want %q", i, merged[i].ID, expected)
		}
	}
}

func TestMergeVendorModelsSortsCodexAdvancedModelsFirst(t *testing.T) {
	merged := MergeVendorModels([]Model{
		{ID: "gpt-5.4-mini", Label: "GPT-5.4 mini", Model: "gpt-5.4-mini", APIStyle: apistyle.OpenAIResponses},
		{ID: "gpt-5.4", Label: "GPT-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses},
	}, []Model{
		{ID: "codex-auto-review", Label: "Auto Review", Model: "codex-auto-review", APIStyle: apistyle.OpenAIResponses},
		{ID: "gpt-5.5", Label: "GPT-5.5", Model: "gpt-5.5", APIStyle: apistyle.OpenAIResponses},
		{ID: "gpt-5.3-codex-spark", Label: "GPT-5.3 Codex Spark", Model: "gpt-5.3-codex-spark", APIStyle: apistyle.OpenAIResponses},
	})
	want := []string{
		"gpt-5.5",
		"gpt-5.4",
		"gpt-5.4-mini",
		"gpt-5.3-codex-spark",
		"codex-auto-review",
	}
	if len(merged) != len(want) {
		t.Fatalf("expected %d merged models, got %d", len(want), len(merged))
	}
	for i, expected := range want {
		if merged[i].ID != expected {
			t.Fatalf("model %d id = %q, want %q", i, merged[i].ID, expected)
		}
	}
}

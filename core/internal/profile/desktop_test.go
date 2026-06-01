package profile

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
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

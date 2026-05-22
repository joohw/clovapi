package apply

import "testing"

func TestKimiModelEntryRequiresMaxContextSize(t *testing.T) {
	ent := kimiModelEntry("claude-sonnet-4-20250514", nil)
	if ent["provider"] != "clovapi" {
		t.Fatalf("provider: %v", ent["provider"])
	}
	if ent["model"] != "claude-sonnet-4-20250514" {
		t.Fatalf("model: %v", ent["model"])
	}
	v, ok := ent["max_context_size"].(int)
	if !ok || v <= 0 {
		t.Fatalf("max_context_size: %v", ent["max_context_size"])
	}
}

func TestKimiModelEntryPreservesExistingMaxContextSize(t *testing.T) {
	prev := map[string]any{"max_context_size": 262144, "capabilities": []any{"thinking"}}
	ent := kimiModelEntry("gpt-4o", prev)
	if ent["max_context_size"] != 262144 {
		t.Fatalf("max_context_size: %v", ent["max_context_size"])
	}
	if ent["capabilities"] == nil {
		t.Fatal("capabilities not preserved")
	}
}

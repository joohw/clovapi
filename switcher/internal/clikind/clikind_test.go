package clikind

import "testing"

func TestParse(t *testing.T) {
	if _, err := Parse("nope"); err == nil {
		t.Fatal("expected error")
	}
	k, err := Parse("claude-code")
	if err != nil || k != ClaudeCode {
		t.Fatalf("%v %v", k, err)
	}
}

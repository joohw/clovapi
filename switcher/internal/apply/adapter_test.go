package apply

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
)

func TestRegisteredKindsStableOrder(t *testing.T) {
	got := RegisteredKinds()
	want := []clikind.Kind{
		clikind.ClaudeCode, clikind.Codex, clikind.OpenCode,
		clikind.OpenClaw, clikind.Hermes, clikind.KimiCode,
	}
	if len(got) != len(want) {
		t.Fatalf("len %d vs %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("idx %d: got %q want %q", i, got[i], want[i])
		}
	}
}

func TestSupportedStylesFromRegistry(t *testing.T) {
	if len(SupportedStyles(clikind.ClaudeCode)) != 1 || SupportedStyles(clikind.ClaudeCode)[0] != apistyle.Claude {
		t.Fatal(clikind.ClaudeCode)
	}
	if len(SupportedStyles(clikind.Codex)) != 1 || SupportedStyles(clikind.Codex)[0] != apistyle.OpenAIResponses {
		t.Fatal(clikind.Codex)
	}
	if len(SupportedStyles(clikind.OpenCode)) != 4 {
		t.Fatal(clikind.OpenCode)
	}
	if len(SupportedStyles(clikind.OpenClaw)) != 4 {
		t.Fatal(clikind.OpenClaw)
	}
}

func TestKindSupportsStyle(t *testing.T) {
	if !KindSupportsStyle(clikind.ClaudeCode, apistyle.Claude) || KindSupportsStyle(clikind.ClaudeCode, apistyle.OpenAIChat) {
		t.Fatal("claude-code")
	}
	if !KindSupportsStyle(clikind.Codex, apistyle.OpenAIResponses) || KindSupportsStyle(clikind.Codex, apistyle.OpenAIChat) {
		t.Fatal("codex")
	}
	if !KindSupportsStyle(clikind.OpenCode, apistyle.Gemini) {
		t.Fatal("opencode gemini")
	}
	if !KindSupportsStyle(clikind.KimiCode, apistyle.OpenAIChat) {
		t.Fatal("kimi openai chat")
	}
}

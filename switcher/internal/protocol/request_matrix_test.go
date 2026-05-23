package protocol_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/protocol"
)

func TestPrepareRequestConversionMatrix(t *testing.T) {
	sampleOpenAIChat := []byte(`{
		"model": "gpt-test",
		"messages": [{"role": "user", "content": "hello"}],
		"stream": true,
		"max_tokens": 64
	}`)
	sampleResponses := []byte(`{
		"model": "resp-test",
		"input": "hello",
		"stream": true,
		"max_tokens": 64,
		"instructions": ""
	}`)
	sampleClaude := []byte(`{
		"model": "claude-test",
		"max_tokens": 64,
		"messages": [{"role": "user", "content": "hello"}],
		"stream": true
	}`)

	hints := protocol.UpstreamHints{Model: "fallback-model"}

	for _, ingress := range apistyle.All() {
		for _, egress := range apistyle.All() {
			name := "ingress_" + ingress.String() + "__egress_" + egress.String()
			t.Run(name, func(t *testing.T) {
				body := sampleOpenAIChat
				switch ingress {
				case apistyle.Claude:
					body = sampleClaude
				case apistyle.OpenAIResponses:
					body = sampleResponses
				}
				upJSON, _, _, err := protocol.PrepareUpstreamRequest(ingress, egress, body, hints)
				if err != nil {
					t.Fatal(err)
				}
				var parsed map[string]any
				if err := json.Unmarshal(upJSON, &parsed); err != nil {
					t.Fatal(err)
				}
				m, ok := parsed["model"].(string)
				if !ok || m == "" {
					t.Fatalf("missing model field: %#v", parsed)
				}
				switch egress {
				case apistyle.Claude:
					msgs, ok := parsed["messages"].([]any)
					if !ok || len(msgs) == 0 {
						t.Fatalf("expected messages[] for claude egress: %#v", parsed)
					}
				case apistyle.OpenAIChat, apistyle.Gemini:
					msgs, ok := parsed["messages"].([]any)
					if !ok || len(msgs) == 0 {
						t.Fatalf("expected messages[] for openai-chat egress: %#v", parsed)
					}
				case apistyle.OpenAIResponses:
					inp, ok := parsed["input"].([]any)
					if !ok || len(inp) == 0 {
						t.Fatalf("expected input[] for responses egress: %#v", parsed)
					}
				}
			})
		}
	}
}

func TestSystemHoistOpenAIChatToClaude(t *testing.T) {
	body := []byte(`{
		"model": "claude-sonnet-4-6",
		"messages": [
		  {"role": "system", "content": "You are a helpful assistant."},
		  {"role": "user", "content": "hello"}
		],
		"stream": false
	}`)
	up, _, _, err := protocol.PrepareUpstreamRequest(apistyle.OpenAIChat, apistyle.Claude, body,
		protocol.UpstreamHints{Model: "claude-sonnet-4-6"})
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(up, &parsed); err != nil {
		t.Fatal(err)
	}
	if got := parsed["system"]; got != "You are a helpful assistant." {
		t.Fatalf("system = %#v", got)
	}
	msgs, _ := parsed["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("want 1 user message after hoist, got %d", len(msgs))
	}
	m0 := msgs[0].(map[string]any)
	if m0["role"] != "user" {
		t.Fatalf("unexpected role %+v", m0)
	}
}

func TestEncodeOpenAIResponsesAssistantHistoryUsesOutputText(t *testing.T) {
	body := []byte(`{
		"model": "gpt-5.4",
		"messages": [
		  {"role": "user", "content": "hello"},
		  {"role": "assistant", "content": "hi there"},
		  {"role": "user", "content": "again"}
		],
		"stream": false
	}`)
	up, _, _, err := protocol.PrepareUpstreamRequest(
		apistyle.OpenAIChat,
		apistyle.OpenAIResponses,
		body,
		protocol.UpstreamHints{Model: "gpt-5.4", Source: "subscription:codex"},
	)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(up, &parsed); err != nil {
		t.Fatal(err)
	}
	inp, ok := parsed["input"].([]any)
	if !ok || len(inp) != 3 {
		t.Fatalf("expected 3 input messages, got %#v", parsed["input"])
	}
	assistant := inp[1].(map[string]any)
	content, ok := assistant["content"].([]any)
	if !ok || len(content) == 0 {
		t.Fatalf("assistant content missing: %#v", assistant)
	}
	part := content[0].(map[string]any)
	if part["type"] != "output_text" {
		t.Fatalf("assistant content type = %#v, want output_text", part["type"])
	}
	user := inp[0].(map[string]any)
	userContent := user["content"].([]any)[0].(map[string]any)
	if userContent["type"] != "input_text" {
		t.Fatalf("user content type = %#v, want input_text", userContent["type"])
	}
}

func TestCodexSubscriptionSkipsMaxOutputTokens(t *testing.T) {
	max := 64
	ir := protocol.Request{
		Model:       "gpt-5.4",
		Messages:    []protocol.Message{{Role: protocol.RoleUser, Content: "hi"}},
		Stream:      false,
		MaxTokens:   &max,
		Meta:        &protocol.Metadata{CodexSubscription: true},
		Temperature: nil,
	}
	raw, err := protocol.EncodeRequestOpenAIResponses(ir)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["max_output_tokens"]; ok {
		t.Fatalf("max_output_tokens must be omitted for Codex subscription: %+v", m)
	}
}

func TestPrepareMissingModelFails(t *testing.T) {
	body := []byte(`{"messages":[{"role":"user","content":"x"}]}`)
	_, _, _, err := protocol.PrepareUpstreamRequest(apistyle.OpenAIChat, apistyle.OpenAIChat, body,
		protocol.UpstreamHints{})
	if err == nil || !strings.Contains(err.Error(), "missing model") {
		t.Fatalf("expected missing model error, got %v", err)
	}
}

func TestClaudeSubscriptionOAuthPrependsBootstrap(t *testing.T) {
	body := []byte(`{
	  "model": "claude-opus-4-7",
	  "messages": [{"role":"user","content":"hi"}],
	  "stream": false
	}`)
	payload, _, _, err := protocol.PrepareUpstreamRequest(
		apistyle.Claude,
		apistyle.Claude,
		body,
		protocol.UpstreamHints{Model: "claude-opus-4-7", Source: "subscription:claude-code"},
	)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(payload, &parsed); err != nil {
		t.Fatal(err)
	}
	sys, ok := parsed["system"].(string)
	if !ok || !strings.Contains(sys, "Claude Code") {
		t.Fatalf("expected oauth bootstrap fragment in system field, got %#v", parsed["system"])
	}
}

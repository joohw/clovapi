package protocol_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/protocol"
)

func TestPrepareOpenAIResponsesPassthroughPreservesToolItems(t *testing.T) {
	body := []byte(`{
		"model": "gpt-5.4",
		"tools": [{"type": "function", "name": "bash", "description": "run shell", "parameters": {"type": "object"}}],
		"input": [
			{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "login"}]},
			{"type": "function_call", "call_id": "call_1", "name": "bash", "arguments": "{\"command\":\"xhs -l\"}"},
			{"type": "function_call_output", "call_id": "call_1", "output": "开始登录..."}
		],
		"stream": true
	}`)
	up, ir, path, err := protocol.PrepareUpstreamRequest(
		apistyle.OpenAIResponses,
		apistyle.OpenAIResponses,
		body,
		protocol.UpstreamHints{Model: "gpt-5.4"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if path == "" {
		t.Fatal("expected non-empty path suffix")
	}
	if !ir.Stream {
		t.Fatalf("stream = false, want true")
	}
	if ir.Model != "gpt-5.4" {
		t.Fatalf("model = %q", ir.Model)
	}

	var parsed map[string]any
	if err := json.Unmarshal(up, &parsed); err != nil {
		t.Fatal(err)
	}
	tools, ok := parsed["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("tools not preserved: %#v", parsed["tools"])
	}
	inp, ok := parsed["input"].([]any)
	if !ok || len(inp) != 3 {
		t.Fatalf("input not preserved: %#v", parsed["input"])
	}
	out := inp[2].(map[string]any)
	if out["type"] != "function_call_output" || out["output"] != "开始登录..." {
		t.Fatalf("function_call_output not preserved: %#v", out)
	}
}

func TestPrepareOpenAIResponsesPassthroughCodexSubscriptionStripsSampling(t *testing.T) {
	body := []byte(`{
		"model": "gpt-5.4",
		"input": "hello",
		"temperature": 0.2,
		"max_output_tokens": 32,
		"max_tokens": 64,
		"stream": false
	}`)
	up, ir, _, err := protocol.PrepareUpstreamRequest(
		apistyle.OpenAIResponses,
		apistyle.OpenAIResponses,
		body,
		protocol.UpstreamHints{Model: "gpt-5.4", Source: "subscription:codex"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if ir.Meta == nil || !ir.Meta.CodexSubscription {
		t.Fatalf("expected CodexSubscription meta, got %+v", ir.Meta)
	}
	var parsed map[string]any
	if err := json.Unmarshal(up, &parsed); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"temperature", "max_output_tokens", "max_tokens"} {
		if _, ok := parsed[key]; ok {
			t.Fatalf("%s must be stripped for Codex subscription passthrough: %+v", key, parsed)
		}
	}
	if parsed["input"] != "hello" {
		t.Fatalf("input = %#v, want passthrough hello", parsed["input"])
	}
	if parsed["stream"] != true {
		t.Fatalf("stream = %#v, want true", parsed["stream"])
	}
}

func TestShouldPassthroughOpenAIResponsesWire(t *testing.T) {
	if !protocol.ShouldPassthroughOpenAIResponsesWire(apistyle.OpenAIResponses, apistyle.OpenAIResponses) {
		t.Fatal("expected identity openai-responses passthrough")
	}
	if protocol.ShouldPassthroughOpenAIResponsesWire(apistyle.OpenAIResponses, apistyle.OpenAIChat) {
		t.Fatal("cross-style must not passthrough")
	}
	if protocol.ShouldPassthroughOpenAIResponsesWire(apistyle.OpenAIChat, apistyle.OpenAIChat) {
		t.Fatal("openai-chat identity must not use responses passthrough")
	}
}

func TestPrepareOpenAIResponsesPassthroughMissingModelFails(t *testing.T) {
	body := []byte(`{"input": "hello"}`)
	_, _, _, err := protocol.PrepareUpstreamRequest(
		apistyle.OpenAIResponses,
		apistyle.OpenAIResponses,
		body,
		protocol.UpstreamHints{},
	)
	if err == nil || !strings.Contains(err.Error(), "missing model") {
		t.Fatalf("expected missing model error, got %v", err)
	}
}

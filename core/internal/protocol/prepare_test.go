package protocol

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestPrepareResponsesInputArrayWithoutTypeForClaudeEgress(t *testing.T) {
	body := []byte(`{
		"model":"claude-sonnet-4-6",
		"stream":true,
		"input":[{"role":"user","content":"Reply exactly: ok"}]
	}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.OpenAIResponses, apistyle.Claude, body, PrepareOptions{
		Model:       "claude-sonnet-4-6",
		ForceStream: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(upstream), "Reply exactly: ok") {
		t.Fatalf("encoded upstream missing user text: %s", upstream)
	}
}

func TestPrepareResponsesToolItemsForClaudeEgress(t *testing.T) {
	body := []byte(`{
		"model":"claude-opus-4-7",
		"stream":true,
		"input":[
			{"type":"message","role":"user","content":[{"type":"input_text","text":"Use tool result."}]},
			{"type":"function_call","call_id":"call_probe_pong","name":"pong","arguments":"{}"},
			{"type":"function_call_output","call_id":"call_probe_pong","output":"pong"},
			{"type":"message","role":"user","content":[{"type":"input_text","text":"reply ok of tool response pong"}]}
		],
		"tools":[{"type":"function","name":"pong","parameters":{"type":"object","properties":{}}}]
	}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.OpenAIResponses, apistyle.Claude, body, PrepareOptions{
		Model:       "claude-opus-4-7",
		ForceStream: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	text := string(upstream)
	if !strings.Contains(text, "tool response pong") {
		t.Fatalf("encoded upstream missing tool response context: %s", upstream)
	}
	if strings.Contains(text, "openai_responses.input_item") {
		t.Fatalf("encoded upstream leaked input item extension: %s", upstream)
	}
}

func TestPrepareClaudeOAuthSameStylePreservesClaudeWireFields(t *testing.T) {
	body := []byte(`{
		"model":"claude-opus-4-7",
		"max_tokens":12000,
		"stream":false,
		"system":[{"type":"text","text":"Custom instructions","cache_control":{"type":"ephemeral"}}],
		"thinking":{"type":"enabled","budget_tokens":2048},
		"metadata":{"client":"fixture"},
		"messages":[{"role":"user","content":[{"type":"text","text":"hello","cache_control":{"type":"ephemeral"}}]}]
	}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.Claude, apistyle.Claude, body, PrepareOptions{
		Model:       "claude-sonnet-4-6",
		ForceStream: true,
		Configure: func(r *Request) {
			ensureMeta(r).ClaudeOAuthEncodingCompatibility = true
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(upstream, &got); err != nil {
		t.Fatal(err)
	}
	if got["model"] != "claude-sonnet-4-6" {
		t.Fatalf("model = %v", got["model"])
	}
	if got["stream"] != true {
		t.Fatalf("stream = %v", got["stream"])
	}
	if got["thinking"] == nil {
		t.Fatalf("thinking field was not preserved: %s", upstream)
	}
	if got["max_tokens"] != float64(claudeOAuthMaxOutputTokens) {
		t.Fatalf("max_tokens = %v", got["max_tokens"])
	}
	if !strings.Contains(string(upstream), "cache_control") {
		t.Fatalf("content block details were not preserved: %s", upstream)
	}
	if !strings.Contains(string(upstream), "cc_version=2.1.126") ||
		!strings.Contains(string(upstream), claudeOAuthSystemBootstrap) {
		t.Fatalf("claude oauth system bootstrap missing: %s", upstream)
	}
}

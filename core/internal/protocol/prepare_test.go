package protocol

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestPrepareResponsesStringInputEncodesAsArrayForSameEgress(t *testing.T) {
	body := []byte(`{"model":"gpt-5.5","input":"ping","stream":true,"max_output_tokens":16}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.OpenAIResponses, apistyle.OpenAIResponses, body, PrepareOptions{
		Model:       "gpt-5.5",
		ForceStream: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err := json.Unmarshal(upstream, &wire); err != nil {
		t.Fatal(err)
	}
	input, ok := wire["input"].([]any)
	if !ok {
		t.Fatalf("input = %#v, want array", wire["input"])
	}
	if len(input) != 1 {
		t.Fatalf("input length = %d, want 1", len(input))
	}
	item, _ := input[0].(map[string]any)
	if item["type"] != "message" || item["role"] != "user" {
		t.Fatalf("input item = %#v", item)
	}
}

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
	for _, want := range []string{`"type":"tool_use"`, `"name":"pong"`, `"type":"tool_result"`, `"tool_use_id":"call_probe_pong"`} {
		if !strings.Contains(text, want) {
			t.Fatalf("encoded Claude request missing %s: %s", want, upstream)
		}
	}
	if strings.Contains(text, "openai_responses.input_item") {
		t.Fatalf("encoded upstream leaked input item extension: %s", upstream)
	}
}

func TestPrepareClaudeToolResultForResponsesEgress(t *testing.T) {
	body := []byte(`{
		"model":"gpt-5.4",
		"stream":true,
		"max_tokens":50000,
		"messages":[
			{"role":"user","content":[{"type":"text","text":"你可以调用工具看看今天的日期吗？"}]},
			{"role":"assistant","content":[{"type":"tool_use","id":"call_date","name":"Shell","input":{"command":"date '+%Y-%m-%d %A %Z'","description":"","run_in_background":false,"timeout":10}}]},
			{"role":"user","content":[{"type":"tool_result","tool_use_id":"call_date","content":[{"type":"text","text":"<system>Command executed successfully.</system>"},{"type":"text","text":"2026-05-28 Thursday CST"}]}]},
			{"role":"user","content":[{"type":"text","text":"请回答日期。"}]}
		],
		"tools":[{"name":"Shell","input_schema":{"type":"object","properties":{"command":{"type":"string"}}}}]
	}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.Claude, apistyle.OpenAIResponses, body, PrepareOptions{
		Model:       "gpt-5.4",
		ForceStream: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	text := string(upstream)
	for _, want := range []string{
		`"type":"function_call"`,
		`"call_id":"call_date"`,
		`"name":"Shell"`,
		`"arguments":"{\"command\":\"date '+%Y-%m-%d %A %Z'\",\"description\":\"\",\"run_in_background\":false,\"timeout\":10}"`,
		`"type":"function_call_output"`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("encoded Responses request missing %s: %s", want, upstream)
		}
	}
	var got map[string]any
	if err := json.Unmarshal(upstream, &got); err != nil {
		t.Fatal(err)
	}
	input, _ := got["input"].([]any)
	if len(input) < 3 {
		t.Fatalf("input = %#v", got["input"])
	}
	out, _ := input[2].(map[string]any)
	if out["type"] != "function_call_output" ||
		out["call_id"] != "call_date" ||
		out["output"] != "<system>Command executed successfully.</system>\n2026-05-28 Thursday CST" {
		t.Fatalf("function_call_output = %#v", out)
	}
}

func TestPrepareClaudeSystemRoleForResponsesEgressUsesInstructionsOnly(t *testing.T) {
	body := []byte(`{
		"model":"gpt-5.4",
		"stream":true,
		"messages":[
			{"role":"system","content":"System rules"},
			{"role":"developer","content":[{"type":"text","text":"Developer rules"}]},
			{"role":"user","content":"hello"}
		]
	}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.Claude, apistyle.OpenAIResponses, body, PrepareOptions{
		Model:       "gpt-5.4",
		ForceStream: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(upstream, &got); err != nil {
		t.Fatal(err)
	}
	if got["instructions"] != "System rules\n\nDeveloper rules" {
		t.Fatalf("instructions = %#v; upstream = %s", got["instructions"], upstream)
	}
	input, _ := got["input"].([]any)
	if len(input) != 1 {
		t.Fatalf("input = %#v; upstream = %s", got["input"], upstream)
	}
	item, _ := input[0].(map[string]any)
	if item["role"] != string(RoleUser) {
		t.Fatalf("input item = %#v; upstream = %s", item, upstream)
	}
	if strings.Contains(string(upstream), `"role":"system"`) || strings.Contains(string(upstream), `"role":"developer"`) {
		t.Fatalf("system-like role leaked into Responses input: %s", upstream)
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

func TestPrepareClaudeSameStylePreservesWireFieldsViaExtensions(t *testing.T) {
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
	if got["max_tokens"] != float64(12000) {
		t.Fatalf("max_tokens = %v", got["max_tokens"])
	}
	if !strings.Contains(string(upstream), "cache_control") {
		t.Fatalf("content block details were not preserved: %s", upstream)
	}
	meta, ok := got["metadata"].(map[string]any)
	if !ok || meta["client"] != "fixture" {
		t.Fatalf("metadata was not preserved: %s", upstream)
	}
}

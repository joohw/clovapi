package protocol

import (
	"strings"
	"testing"
)

func TestAppendClaudeRequestFieldExtensionsPreservesComplexWire(t *testing.T) {
	raw, err := jsonDecodeMap([]byte(`{
		"model":"claude-opus-4-7",
		"max_tokens":1024,
		"stream":true,
		"thinking":{"type":"enabled","budget_tokens":2048},
		"system":[{"type":"text","text":"sys","cache_control":{"type":"ephemeral"}}],
		"messages":[{"role":"user","content":[{"type":"text","text":"hi","cache_control":{"type":"ephemeral"}}]}]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	req := Request{Model: "claude-opus-4-7"}
	if err := appendClaudeRequestFieldExtensions(&req, raw); err != nil {
		t.Fatal(err)
	}
	if len(req.Extensions) < 3 {
		t.Fatalf("extensions = %#v, want thinking/system/messages preserved", req.Extensions)
	}

	upstream, err := EncodeRequestClaude(req)
	if err != nil {
		t.Fatal(err)
	}
	text := string(upstream)
	for _, want := range []string{`"thinking"`, `"cache_control"`, `"budget_tokens":2048`} {
		if !strings.Contains(text, want) {
			t.Fatalf("encoded upstream missing %s: %s", want, upstream)
		}
	}
}

func TestAppendClaudeRequestFieldExtensionsSkipsSimpleWire(t *testing.T) {
	raw, err := jsonDecodeMap([]byte(`{
		"model":"claude-opus-4-7",
		"max_tokens":1024,
		"stream":true,
		"messages":[{"role":"user","content":"hello"}]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	req := Request{Model: "claude-opus-4-7", Messages: []Message{{Role: RoleUser, Content: "hello"}}}
	if err := appendClaudeRequestFieldExtensions(&req, raw); err != nil {
		t.Fatal(err)
	}
	if len(req.Extensions) != 0 {
		t.Fatalf("extensions = %#v, want none for simple wire", req.Extensions)
	}
}

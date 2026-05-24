package protocol_test

import (
	"encoding/json"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/protocol"
)

func TestDecodeClaudeToolsRoundTrip(t *testing.T) {
	body := []byte(`{
	  "model": "claude-sonnet-4-6",
	  "messages": [{"role":"user","content":"hi"}],
	  "tools": [{"name":"terminal","description":"run shell","input_schema":{"type":"object","properties":{}}}],
	  "stream": true
	}`)
	req, err := protocol.DecodeRequestClaude(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(req.Tools) != 1 || req.Tools[0].Name != "terminal" {
		t.Fatalf("tools = %#v", req.Tools)
	}
	out, err := protocol.EncodeRequestClaude(req)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	tools, ok := parsed["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("encoded tools = %#v", parsed["tools"])
	}
}

func TestClaudeSubscriptionOAuthForwardsTools(t *testing.T) {
	body := []byte(`{
	  "model": "claude-sonnet-4-6",
	  "messages": [{"role":"user","content":"hi"}],
	  "tools": [{"name":"terminal","description":"run shell","input_schema":{"type":"object","properties":{}}}],
	  "max_tokens": 1024,
	  "stream": true
	}`)
	payload, _, _, err := protocol.PrepareUpstreamRequest(
		apistyle.Claude,
		apistyle.Claude,
		body,
		protocol.UpstreamHints{Model: "claude-sonnet-4-6", Source: "subscription:claude-code"},
	)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(payload, &parsed); err != nil {
		t.Fatal(err)
	}
	tools, ok := parsed["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("oauth upstream tools = %#v", parsed["tools"])
	}
}

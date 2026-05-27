package protocol

import (
	"encoding/json"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestToolCallRoundTripClaudeToResponses(t *testing.T) {
	body := []byte(`{
		"model":"gpt-5.4",
		"stream":true,
		"messages":[
			{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Shell","input":{"command":"date"}}]},
			{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"2026-05-28"}]}
		]
	}`)
	ir, err := DecodeRequestClaude(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(ir.InputSlots) != 2 {
		t.Fatalf("InputSlots = %d, want 2", len(ir.InputSlots))
	}
	if ir.InputSlots[0].ToolCall == nil || ir.InputSlots[0].ToolCall.ID != "toolu_1" {
		t.Fatalf("slot[0] = %#v", ir.InputSlots[0])
	}
	if ir.InputSlots[1].ToolResult == nil || ir.InputSlots[1].ToolResult.Output != "2026-05-28" {
		t.Fatalf("slot[1] = %#v", ir.InputSlots[1])
	}
	if ir.InputSlots[0].Extension != nil || ir.InputSlots[1].Extension != nil {
		t.Fatalf("tool slots should not use extension: %#v", ir.InputSlots)
	}

	up, _, err := PrepareUpstreamRequest(apistyle.Claude, apistyle.OpenAIResponses, body, PrepareOptions{ForceStream: true})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(up, &got); err != nil {
		t.Fatal(err)
	}
	input, _ := got["input"].([]any)
	if len(input) != 2 {
		t.Fatalf("input = %#v", got["input"])
	}
	call, _ := input[0].(map[string]any)
	if call["type"] != "function_call" || call["call_id"] != "toolu_1" {
		t.Fatalf("function_call = %#v", call)
	}
}

func TestToolCallRoundTripResponsesIngressUsesIR(t *testing.T) {
	body := []byte(`{
		"model":"gpt-5.4",
		"stream":true,
		"input":[
			{"type":"function_call","call_id":"call_x","name":"pong","arguments":"{}"},
			{"type":"function_call_output","call_id":"call_x","output":"ok"}
		]
	}`)
	ir, err := DecodeRequestOpenAIResponses(body)
	if err != nil {
		t.Fatal(err)
	}
	if ir.InputSlots[0].ToolCall == nil || ir.InputSlots[1].ToolResult == nil {
		t.Fatalf("slots = %#v", ir.InputSlots)
	}
}

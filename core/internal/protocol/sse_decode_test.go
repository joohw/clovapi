package protocol

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestDecodeOpenAIResponsesCompletedNormalizesNullOutput(t *testing.T) {
	rec := SSERecord{
		Event: "response.completed",
		Data:  `{"type":"response.completed","response":{"id":"resp_test","status":"completed","output":null,"usage":{"input_tokens":5,"output_tokens":3}}}`,
	}

	var st SSEUpstreamDecodeState
	events := DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st)
	if len(events) == 0 || events[0].Type != RespWireExtension || events[0].Extension == nil {
		t.Fatalf("first event = %#v, want preserved wire extension", events)
	}

	var wire WireSSEPayload
	if err := json.Unmarshal(events[0].Extension.Payload, &wire); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(wire.Data), &payload); err != nil {
		t.Fatal(err)
	}
	response, _ := payload["response"].(map[string]any)
	output, ok := response["output"].([]any)
	if !ok {
		t.Fatalf("response.output = %#v, want []", response["output"])
	}
	if len(output) != 0 {
		t.Fatalf("response.output len = %d, want 0", len(output))
	}
	if _, ok := response["usage"].(map[string]any); !ok {
		t.Fatalf("response.usage was not preserved: %#v", response["usage"])
	}
}

func TestDecodeOpenAIResponsesCompletedAddsMissingOutput(t *testing.T) {
	rec := SSERecord{
		Event: "response.completed",
		Data:  `{"type":"response.completed","response":{"id":"resp_test","object":"response","status":"completed","usage":{"input_tokens":5,"output_tokens":3}}}`,
	}

	var st SSEUpstreamDecodeState
	events := DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st)
	if len(events) == 0 || events[0].Type != RespWireExtension || events[0].Extension == nil {
		t.Fatalf("first event = %#v, want preserved wire extension", events)
	}

	var wire WireSSEPayload
	if err := json.Unmarshal(events[0].Extension.Payload, &wire); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(wire.Data), &payload); err != nil {
		t.Fatal(err)
	}
	response, _ := payload["response"].(map[string]any)
	output, ok := response["output"].([]any)
	if !ok {
		t.Fatalf("response.output = %#v, want []", response["output"])
	}
	if len(output) != 0 {
		t.Fatalf("response.output len = %d, want 0", len(output))
	}
}

func TestDecodeOpenAIResponsesWireEventsNormalizeNullIterableFields(t *testing.T) {
	rec := SSERecord{
		Event: "response.output_item.done",
		Data:  `{"type":"response.output_item.done","response":{"status":"in_progress","output":null},"item":{"type":"message","content":null},"part":{"type":"output_text","annotations":null,"logprobs":null,"text":"ok"}}`,
	}

	var st SSEUpstreamDecodeState
	events := DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st)
	if len(events) != 1 || events[0].Type != RespWireExtension || events[0].Extension == nil {
		t.Fatalf("events = %#v, want one preserved wire extension", events)
	}

	var wire WireSSEPayload
	if err := json.Unmarshal(events[0].Extension.Payload, &wire); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(wire.Data), &payload); err != nil {
		t.Fatal(err)
	}

	response, _ := payload["response"].(map[string]any)
	if output, ok := response["output"].([]any); !ok || len(output) != 0 {
		t.Fatalf("response.output = %#v, want []", response["output"])
	}
	item, _ := payload["item"].(map[string]any)
	if content, ok := item["content"].([]any); !ok || len(content) != 0 {
		t.Fatalf("item.content = %#v, want []", item["content"])
	}
	part, _ := payload["part"].(map[string]any)
	if annotations, ok := part["annotations"].([]any); !ok || len(annotations) != 0 {
		t.Fatalf("part.annotations = %#v, want []", part["annotations"])
	}
	if logprobs, ok := part["logprobs"].([]any); !ok || len(logprobs) != 0 {
		t.Fatalf("part.logprobs = %#v, want []", part["logprobs"])
	}
}

func TestClaudeToolUseStreamsAsOpenAIResponsesFunctionCall(t *testing.T) {
	records := []SSERecord{
		{Event: "message_start", Data: `{"type":"message_start","message":{"model":"claude-opus-4-6","role":"assistant","content":[]}}`},
		{Event: "content_block_start", Data: `{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_test","name":"exec_command","input":{}}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\""}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":":\"pwd\"}"}}`},
		{Event: "content_block_stop", Data: `{"type":"content_block_stop","index":0}`},
		{Event: "message_delta", Data: `{"type":"message_delta","delta":{"stop_reason":"tool_use"}}`},
	}

	var dec SSEUpstreamDecodeState
	enc := NewStreamIngressEncoder(apistyle.OpenAIResponses)
	var raw string
	for _, rec := range records {
		for _, ev := range DecodeSSEStreamRecord(apistyle.Claude, rec, &dec) {
			if ev.Type == RespWireExtension {
				continue
			}
			chunks, _, err := enc.EncodeEvent(ev)
			if err != nil {
				t.Fatal(err)
			}
			for _, chunk := range chunks {
				raw += string(chunk)
			}
		}
	}

	for _, want := range []string{
		`"type":"function_call"`,
		`"type":"response.function_call_arguments.delta"`,
		`"type":"response.function_call_arguments.done"`,
		`"call_id":"call_toolu_test"`,
		`"name":"exec_command"`,
		`"arguments":"{\"cmd\":\"pwd\"}"`,
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("encoded Responses SSE missing %s in %s", want, raw)
		}
	}
	if strings.Contains(raw, `"text":"{\"cmd\""`) {
		t.Fatalf("tool arguments leaked as output text: %s", raw)
	}
}

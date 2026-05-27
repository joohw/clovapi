package protocol

import (
	"encoding/json"
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

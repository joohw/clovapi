package protocol

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestResponsesJSONToOpenAIChatPreservesUsageDetails(t *testing.T) {
	upstream := []byte(`{
		"id":"resp_1",
		"object":"response",
		"model":"gpt-5.4",
		"status":"completed",
		"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],
		"usage":{
			"input_tokens":1226,
			"output_tokens":5,
			"total_tokens":1231,
			"input_tokens_details":{"cached_tokens":1024},
			"output_tokens_details":{"reasoning_tokens":3}
		}
	}`)
	status, _, body, err := FinalizeNonStreamProxyDownstream(
		apistyle.OpenAIChat,
		apistyle.OpenAIResponses,
		http.StatusOK,
		http.Header{"Content-Type": []string{"application/json"}},
		upstream,
	)
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	usage, _ := payload["usage"].(map[string]any)
	if usage["prompt_tokens"] != float64(1226) ||
		usage["completion_tokens"] != float64(5) ||
		usage["total_tokens"] != float64(1231) {
		t.Fatalf("usage = %#v", usage)
	}
	promptDetails, _ := usage["prompt_tokens_details"].(map[string]any)
	if promptDetails["cached_tokens"] != float64(1024) {
		t.Fatalf("prompt_tokens_details = %#v", promptDetails)
	}
	completionDetails, _ := usage["completion_tokens_details"].(map[string]any)
	if completionDetails["reasoning_tokens"] != float64(3) {
		t.Fatalf("completion_tokens_details = %#v", completionDetails)
	}
}

func TestMaterializePlainUpstreamEventsHTTPErrorPreservesPlaintextBody(t *testing.T) {
	body := []byte("upstream connect error or disconnect/reset before headers")
	ev := MaterializePlainUpstreamEvents(apistyle.OpenAIResponses, 503, body)
	if len(ev) != 1 || ev[0].Type != RespError {
		t.Fatalf("events = %#v", ev)
	}
	if ev[0].Code != UpstreamErrorCode {
		t.Fatalf("code = %q want %q", ev[0].Code, UpstreamErrorCode)
	}
	if ev[0].Message != string(body) {
		t.Fatalf("message = %q", ev[0].Message)
	}
}

func TestMaterializePlainUpstreamEventsSuccessBodyStillDecodeFailed(t *testing.T) {
	ev := MaterializePlainUpstreamEvents(apistyle.OpenAIResponses, 200, []byte("undefined"))
	if len(ev) != 1 || ev[0].Type != RespError {
		t.Fatalf("events = %#v", ev)
	}
	if ev[0].Code != DecodeFailCode {
		t.Fatalf("code = %q want %q", ev[0].Code, DecodeFailCode)
	}
	if !strings.Contains(ev[0].Message, "invalid character") {
		t.Fatalf("message = %q", ev[0].Message)
	}
}

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

func TestEncodeNonStreamJSONResponsePreservesUsageForResponsesAndClaude(t *testing.T) {
	events := []ResponseEvent{
		{Type: RespTextDelta, Text: "ok"},
		{
			Type:               RespUsage,
			InputTokens:        12,
			OutputTokens:       3,
			CachedTokens:       8,
			ReasoningTokens:    2,
			HasCachedTokens:    true,
			HasReasoningTokens: true,
		},
		{Type: RespFinish, Reason: "completed"},
	}
	tests := []struct {
		name   string
		style  apistyle.Style
		assert func(*testing.T, map[string]any)
	}{
		{
			name:  "responses",
			style: apistyle.OpenAIResponses,
			assert: func(t *testing.T, payload map[string]any) {
				usage, _ := payload["usage"].(map[string]any)
				if usage["input_tokens"] != float64(12) ||
					usage["output_tokens"] != float64(3) ||
					usage["total_tokens"] != float64(15) {
					t.Fatalf("usage = %#v", usage)
				}
				inDetails, _ := usage["input_tokens_details"].(map[string]any)
				outDetails, _ := usage["output_tokens_details"].(map[string]any)
				if inDetails["cached_tokens"] != float64(8) ||
					outDetails["reasoning_tokens"] != float64(2) {
					t.Fatalf("usage details = %#v %#v", inDetails, outDetails)
				}
			},
		},
		{
			name:  "claude",
			style: apistyle.Claude,
			assert: func(t *testing.T, payload map[string]any) {
				usage, _ := payload["usage"].(map[string]any)
				if usage["input_tokens"] != float64(12) ||
					usage["output_tokens"] != float64(3) ||
					usage["cache_read_input_tokens"] != float64(8) {
					t.Fatalf("usage = %#v", usage)
				}
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body, err := EncodeNonStreamJSONResponseForStyle(tc.style, events)
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatal(err)
			}
			tc.assert(t, payload)
		})
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

package protocol_test

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/protocol"
)

func TestNonStreamDecodeEncodeClaudeToOpenAIChat(t *testing.T) {
	t.Parallel()
	raw := []byte(`{
	  "type": "message",
	  "role": "assistant",
	  "model": "claude-opus",
	  "content": [{"type": "text", "text": "Hi there"}],
	  "stop_reason": "end_turn"
	}`)
	ev, err := protocol.DecodeNonStreamJSONResponseForStyle(apistyle.Claude, raw)
	if err != nil {
		t.Fatal(err)
	}
	body, err := protocol.EncodeNonStreamJSONResponseForStyle(apistyle.OpenAIChat, ev)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatal(err)
	}
	choices, ok := decoded["choices"].([]any)
	if !ok || len(choices) == 0 {
		t.Fatalf("missing choices %+v", decoded)
	}
	msg, ok := choices[0].(map[string]any)["message"].(map[string]any)
	if !ok {
		t.Fatalf("missing message %+v", choices[0])
	}
	if msg["content"] != "Hi there" {
		t.Fatalf("content=%v", msg["content"])
	}
}

func TestNonStreamDecodeEncodeOpenAIResponsesToClaude(t *testing.T) {
	t.Parallel()
	raw := []byte(`{
	  "object": "response",
	  "model": "gpt-5",
	  "status": "completed",
	  "output": [
	    {
	      "type": "message",
	      "role": "assistant",
	      "content": [{"type": "output_text", "text": "你好"}]
	    }
	  ]
	}`)
	ev, err := protocol.DecodeNonStreamJSONResponseForStyle(apistyle.OpenAIResponses, raw)
	if err != nil {
		t.Fatal(err)
	}
	body, err := protocol.EncodeNonStreamJSONResponseForStyle(apistyle.Claude, ev)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["stop_reason"] != "end_turn" {
		t.Fatalf("stop_reason=%v", payload["stop_reason"])
	}
	content := payload["content"].([]any)
	first := content[0].(map[string]any)
	if first["text"] != "你好" {
		t.Fatalf("text mismatch: %+v", first)
	}
}

func TestFinalizeCrossStylePropagatesUpstreamErrorShape(t *testing.T) {
	t.Parallel()
	status, hdr, body, err := protocol.FinalizeNonStreamProxyDownstream(
		apistyle.OpenAIChat,
		apistyle.Claude,
		401,
		http.Header{"Content-Type": {"application/json"}},
		[]byte(`{"type":"error","error":{"type":"invalid_request_error","message":"nope"}}`),
	)
	if err != nil {
		t.Fatal(err)
	}
	if status != 401 {
		t.Fatalf("status=%d", status)
	}
	if hdr.Get("Content-Encoding") != "" || hdr.Get("Content-Length") == "" {
		t.Fatalf("bad headers %+v", hdr)
	}
	var wire map[string]any
	if err := json.Unmarshal(body, &wire); err != nil {
		t.Fatal(err)
	}
	if wire["choices"] != nil {
		t.Fatalf("expected OpenAI-shaped error envelope, got %+v", wire)
	}
}

func TestFinalizeNonStreamMaterializesUpstreamSSE(t *testing.T) {
	t.Parallel()
	sseReply := strings.Join([]string{
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"Chat title"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed"}`,
		``,
	}, "\n")
	status, hdr, body, err := protocol.FinalizeNonStreamProxyDownstream(
		apistyle.OpenAIChat,
		apistyle.OpenAIResponses,
		200,
		http.Header{"Content-Type": {"text/event-stream; charset=utf-8"}},
		[]byte(sseReply),
	)
	if err != nil {
		t.Fatal(err)
	}
	if status != 200 {
		t.Fatalf("status=%d", status)
	}
	if strings.Contains(strings.ToLower(hdr.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("expected JSON downstream headers, got %+v", hdr)
	}
	var wire map[string]any
	if err := json.Unmarshal(body, &wire); err != nil {
		t.Fatal(err)
	}
	choices := wire["choices"].([]any)
	msg := choices[0].(map[string]any)["message"].(map[string]any)
	if msg["content"] != "Chat title" {
		t.Fatalf("content=%v", msg["content"])
	}
}

func TestGzipUpstreamBodyDecompression(t *testing.T) {
	t.Parallel()
	plain := []byte(`{"type":"message","role":"assistant","model":"cl","content":[{"type":"text","text":"z"}],"stop_reason":"end_turn"}`)
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	if _, err := gw.Write(plain); err != nil {
		t.Fatal(err)
	}
	if err := gw.Close(); err != nil {
		t.Fatal(err)
	}
	got, err := protocol.DecodeCompressedResponseBody("gzip", buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(plain) {
		t.Fatalf("decoded=%s", got)
	}

	h := http.Header{}
	h.Set("Content-Type", "application/json")
	h.Set("Content-Encoding", "gzip")

	status, hdr, out, ferr := protocol.FinalizeNonStreamProxyDownstream(
		apistyle.OpenAIChat,
		apistyle.Claude,
		200,
		h,
		buf.Bytes(),
	)
	if ferr != nil {
		t.Fatal(ferr)
	}
	if status != 200 || hdr.Get("Content-Encoding") != "" {
		t.Fatalf("hdr=%v", hdr)
	}
	var payload map[string]any
	if err := json.Unmarshal(out, &payload); err != nil {
		t.Fatal(err)
	}
	choices := payload["choices"].([]any)
	msg := choices[0].(map[string]any)["message"].(map[string]any)
	if msg["content"] != "z" {
		t.Fatalf("content=%v", msg["content"])
	}
}

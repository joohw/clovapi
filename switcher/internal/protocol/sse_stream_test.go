package protocol_test

import (
	"bytes"
	"context"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/protocol"
)

func TestSSEParseMultilineDataAndHeartbeat(t *testing.T) {
	t.Parallel()
	st := protocol.SSEParseState{}
	block := strings.Join([]string{
		"event: message",
		"data: first",
		": heartbeat ignore",
		"data: second",
		"",
	}, "\n") + "\n"
	var out []protocol.SSERecord
	if len(block) < 10 {
		t.Fatal(block)
	}
	half := len(block) / 2
	frags := []string{block[:half], block[half:]}
	for _, frag := range frags {
		out = append(out, protocol.AppendParse([]byte(frag), &st)...)
	}
	if len(out) != 1 {
		t.Fatalf("records=%d %+v", len(out), out)
	}
	if out[0].Event != "message" {
		t.Fatalf("event=%q", out[0].Event)
	}
	if want := strings.Join([]string{"first", "second"}, "\n"); out[0].Data != want {
		t.Fatalf("data=%q want %q", out[0].Data, want)
	}
}

func TestTranscodeSSEClaudeUpstreamToOpenAIChatDownstream(t *testing.T) {
	t.Parallel()
	sseWire := strings.Join([]string{
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}`,
		"",
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		"",
	}, "\n")
	rr := httptest.NewRecorder()
	if err := protocol.TranscodePlaintextSSEToIngress(context.Background(), apistyle.OpenAIChat, apistyle.Claude, "wired-model",
		strings.NewReader(sseWire), rr); err != nil {
		t.Fatal(err)
	}
	raw := rr.Body.String()
	if !strings.Contains(raw, `"object":"chat.completion.chunk"`) {
		t.Fatalf("missing chunk framing: %q", raw)
	}
	if !strings.Contains(raw, "[DONE]") {
		t.Fatalf("missing [DONE]: %q", raw)
	}
}

func TestTranscodeSSEOpenAIResponsesUpstreamToClaudeDownstream(t *testing.T) {
	t.Parallel()
	sseWire := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"model":"gpt-5.4"}}`,
		"",
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"你好"}`,
		"",
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed","response":{"usage":{"input_tokens":12,"output_tokens":3}}}`,
		"",
	}, "\n")
	rr := httptest.NewRecorder()
	if err := protocol.TranscodePlaintextSSEToIngress(context.Background(), apistyle.Claude, apistyle.OpenAIResponses, "gpt-5.4",
		strings.NewReader(sseWire), rr); err != nil {
		t.Fatal(err)
	}
	raw := rr.Body.String()
	if !strings.Contains(raw, "event: message_start") || !strings.Contains(raw, "content_block_delta") {
		t.Fatalf("want claude stream events, got:\n%s", raw)
	}
	if !strings.Contains(raw, "你好") || !strings.Contains(raw, "event: message_stop") {
		t.Fatalf("missing unicode or stop framing: %q", raw)
	}
	if strings.Contains(raw, `"stop_reason":"completed"`) {
		t.Fatalf("claude ingress must map codex completed → end_turn:\n%s", raw)
	}
	if !strings.Contains(raw, `"stop_reason":"end_turn"`) {
		t.Fatalf("missing end_turn stop_reason:\n%s", raw)
	}
	if !strings.Contains(raw, `"output_tokens":3`) {
		t.Fatalf("message_delta must carry usage.output_tokens from upstream:\n%s", raw)
	}
}

type countReader struct {
	r io.Reader
	n int64
}

func (c *countReader) Read(p []byte) (int, error) {
	nn, err := c.r.Read(p)
	c.n += int64(nn)
	return nn, err
}

func TestTranscodeSSE_drainsPlaintextAfterClaudeIngressTerminal(t *testing.T) {
	t.Parallel()
	const leakedText = `LEAK_MARKER_AFTER_STOP`

	trailing := strings.Join([]string{
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"` + leakedText + `"}}`,
		``,
		``,
	}, "\n")

	head := strings.Join([]string{
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")

	fullWire := []byte(head + trailing)

	cr := &countReader{r: bytes.NewReader(fullWire)}
	rr := httptest.NewRecorder()
	err := protocol.TranscodePlaintextSSEToIngress(context.Background(), apistyle.Claude, apistyle.Claude, "m-model",
		cr, rr)
	if err != nil {
		t.Fatal(err)
	}
	if cr.n != int64(len(fullWire)) {
		t.Fatalf("plaintext not drained: read %d of %d", cr.n, len(fullWire))
	}
	raw := rr.Body.String()
	if strings.Contains(raw, leakedText) {
		t.Fatalf("downstream must not transcribe SSE after ingress terminal encoding: %q", raw)
	}
	if !strings.Contains(raw, `event: message_stop`) || !strings.Contains(raw, `"text":"Hi"`) {
		t.Fatalf("expected normal transcoded prelude: %q", raw)
	}
}

func TestLooksLikeSSEWire(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want bool
	}{
		{"event: response.created\n", true},
		{"\r\nevent: hello\n", true},
		{"data: {}\n", true},
		{`{"error":"nope"}`, false},
		{"", false},
	}
	for _, tc := range cases {
		if got := protocol.LooksLikeSSEWire([]byte(tc.in)); got != tc.want {
			t.Fatalf("LooksLikeSSEWire(%q) = %v want %v", tc.in, got, tc.want)
		}
	}
	if !protocol.UpstreamResponseLooksLikeSSE("", []byte("event: x\n")) {
		t.Fatal("prefix heuristic should detect SSE without content-type")
	}
	if !protocol.UpstreamResponseLooksLikeSSE("text/event-stream", nil) {
		t.Fatal("content-type should detect SSE")
	}
}

func TestShouldPassthroughStreamingSSE(t *testing.T) {
	t.Parallel()
	if !protocol.ShouldPassthroughStreamingSSE(apistyle.OpenAIResponses, apistyle.OpenAIResponses) {
		t.Fatal("openai-responses same-style streams should passthrough")
	}
	if protocol.ShouldPassthroughStreamingSSE(apistyle.OpenAIChat, apistyle.OpenAIChat) {
		t.Fatal("openai-chat same-style streams should still transcode")
	}
	if protocol.ShouldPassthroughStreamingSSE(apistyle.OpenAIResponses, apistyle.OpenAIChat) {
		t.Fatal("cross-style must not passthrough")
	}
}

func TestTranscodeSSEOpenAIResponsesUpstreamToOpenAIResponsesDownstreamEmitsCreated(t *testing.T) {
	t.Parallel()
	sseWire := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"model":"gpt-5.4"}}`,
		``,
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"ok"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed","response":{"usage":{"input_tokens":12,"output_tokens":3}}}`,
		``,
	}, "\n")
	rr := httptest.NewRecorder()
	if err := protocol.TranscodePlaintextSSEToIngress(context.Background(), apistyle.OpenAIResponses, apistyle.OpenAIResponses, "",
		strings.NewReader(sseWire), rr); err != nil {
		t.Fatal(err)
	}
	raw := rr.Body.String()
	if !strings.Contains(raw, "event: response.created") {
		t.Fatalf("missing response.created before deltas:\n%s", raw)
	}
	if !strings.Contains(raw, "event: response.output_item.added") || !strings.Contains(raw, "item_id") {
		t.Fatalf("missing Codex item framing:\n%s", raw)
	}
	createdIdx := strings.Index(raw, "event: response.created")
	itemIdx := strings.Index(raw, "event: response.output_item.added")
	deltaIdx := strings.Index(raw, "event: response.output_text.delta")
	if createdIdx < 0 || itemIdx < 0 || deltaIdx < 0 || !(createdIdx < itemIdx && itemIdx < deltaIdx) {
		t.Fatalf("responses events out of order:\n%s", raw)
	}
	if !strings.Contains(raw, "ok") || !strings.Contains(raw, "event: response.completed") {
		t.Fatalf("missing delta or completed:\n%s", raw)
	}
}

func TestTranscodeSSEClaudeUpstreamToOpenAIResponsesDownstream(t *testing.T) {
	t.Parallel()
	sseWire := strings.Join([]string{
		`event: message_start`,
		`data: {"type":"message_start","message":{"model":"claude-sonnet-4-6"}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"claude-ok"}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")
	rr := httptest.NewRecorder()
	if err := protocol.TranscodePlaintextSSEToIngress(context.Background(), apistyle.OpenAIResponses, apistyle.Claude, "claude-sonnet-4-6",
		strings.NewReader(sseWire), rr); err != nil {
		t.Fatal(err)
	}
	raw := rr.Body.String()
	if strings.Count(raw, "event: response.created") != 1 {
		t.Fatalf("expected single response.created, got:\n%s", raw)
	}
	if !strings.Contains(raw, "event: response.output_item.added") || !strings.Contains(raw, "claude-ok") || !strings.Contains(raw, "event: response.completed") {
		t.Fatalf("missing codex-compatible responses stream:\n%s", raw)
	}
}

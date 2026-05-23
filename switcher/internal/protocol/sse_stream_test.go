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
		`data: {"type":"response.completed","status":"completed"}`,
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

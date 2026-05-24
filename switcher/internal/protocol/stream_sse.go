package protocol

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// IngressUsesClaudeSSEWire matches Electron ingressWantsSse — Claude ingress streaming clients accept SSE envelopes for upstream JSON failures.
func IngressUsesClaudeSSEWire(ingress apistyle.Style, wantsStream bool) bool {
	return wantsStream && ingress == apistyle.Claude
}

// LooksLikeSSEWire reports whether a plaintext prefix resembles SSE framing (event:/data:/id:/retry:).
// Codex subscription upstream often omits Content-Type: text/event-stream while still streaming SSE.
func LooksLikeSSEWire(prefix []byte) bool {
	s := strings.TrimLeft(string(prefix), " \t\r\n")
	if s == "" {
		return false
	}
	return strings.HasPrefix(s, "event:") ||
		strings.HasPrefix(s, "data:") ||
		strings.HasPrefix(s, "id:") ||
		strings.HasPrefix(s, "retry:")
}

// UpstreamResponseLooksLikeSSE combines Content-Type with optional body-prefix heuristics.
func UpstreamResponseLooksLikeSSE(contentType string, bodyPrefix []byte) bool {
	if strings.Contains(strings.ToLower(strings.TrimSpace(contentType)), "text/event-stream") {
		return true
	}
	return LooksLikeSSEWire(bodyPrefix)
}

// MergeSSEProxyDownstreamHeaders overlays canonical SSE framing headers atop sanitized upstream metadata (Electron transformResponse SSE branch).
func MergeSSEProxyDownstreamHeaders(baseSanitized http.Header) http.Header {
	out := http.Header{}
	if baseSanitized != nil {
		for k, vv := range baseSanitized {
			lk := strings.ToLower(strings.TrimSpace(k))
			if lk == "content-length" || lk == "content-type" {
				continue
			}
			out[k] = append([]string(nil), vv...)
		}
	}
	out.Set("Content-Type", "text/event-stream; charset=utf-8")
	out.Set("Cache-Control", "no-cache")
	out.Set("Connection", "keep-alive")
	out.Del("Content-Length")
	return out
}

// MergeMinimalSSEStreamingErrorHeaders emits Claude-sized SSE envelopes on JSON upstream errors (Electron status>=400 + ingressWantsSse).
func MergeMinimalSSEStreamingErrorHeaders() http.Header {
	h := http.Header{}
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	return h
}

func streamFlushMaybe(w http.ResponseWriter) func() {
	if f, ok := w.(http.Flusher); ok {
		return func() { f.Flush() }
	}
	return func() {}
}

// ShouldPassthroughStreamingSSE mirrors FinalizeNonStreamProxyDownstream identity passthrough for streaming
// openai-responses relays (Codex subscription): decode→IR→encode drops response.created and breaks Codex.
func ShouldPassthroughStreamingSSE(ingress, egress apistyle.Style) bool {
	return ShouldPassthroughOpenAIResponsesWire(ingress, egress)
}

// PassthroughStreamingPlaintextSSE relays upstream SSE bytes verbatim after decompression.
func PassthroughStreamingPlaintextSSE(ctx context.Context, plaintext io.Reader, w http.ResponseWriter) error {
	flush := streamFlushMaybe(w)
	buf := make([]byte, 16*1024)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, readErr := plaintext.Read(buf)
		if n > 0 {
			if _, err := w.Write(buf[:n]); err != nil {
				return err
			}
			flush()
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return nil
			}
			return readErr
		}
	}
}

// TranscodePlaintextSSEToIngress converts egress-shaped SSE plaintext into ingress-shaped SSE (decoder -> IR -> encoder), mirroring Electron transformResponse.
//
// prependModel emits an initial message_start event like Electron eventsWithModel.
//
// When the ingress encoder emits a terminal chunk (logical end of stream for that wire shape),
// plaintext is still consumed to EOF while suppressing further downstream writes, so layered
// readers (gzip/http bodies) drain completely unless ctx is canceled or writes fail first.
func TranscodePlaintextSSEToIngress(ctx context.Context, ingress, egress apistyle.Style, prependModelFromIR string, plaintext io.Reader, w http.ResponseWriter) error {
	flush := streamFlushMaybe(w)
	enc := NewStreamIngressEncoder(ingress)
	parseSt := SSEParseState{}
	decSt := SSEUpstreamDecodeState{}
	downstreamClosed := false

	writeChunks := func(chunks [][]byte) error {
		for _, bs := range chunks {
			if len(bs) == 0 {
				continue
			}
			if _, err := w.Write(bs); err != nil {
				return err
			}
			flush()
		}
		return nil
	}

	emitEvent := func(ev ResponseEvent) (ingressTerminal bool, err error) {
		chunks, done, encErr := enc.EncodeEvent(ev)
		if encErr != nil {
			return true, encErr
		}
		if err := writeChunks(chunks); err != nil {
			return true, err
		}
		return done, nil
	}

	if m := strings.TrimSpace(prependModelFromIR); m != "" && ingressStyleForResponse(ingress) != apistyle.OpenAIResponses {
		term, err := emitEvent(ResponseEvent{Type: RespMessageStart, Role: string(RoleAssistant), Model: m})
		if err != nil {
			return err
		}
		if term {
			downstreamClosed = true
		}
	}

	buf := make([]byte, 16*1024)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, readErr := plaintext.Read(buf)
		if n > 0 {
			if downstreamClosed {
				for _, rec := range AppendParse(buf[:n], &parseSt) {
					_ = rec // SSE framing only: discard complete events while draining plaintext to EOF.
				}
			} else {
				for _, rec := range AppendParse(buf[:n], &parseSt) {
					for _, ev := range DecodeSSEStreamRecord(egress, rec, &decSt) {
						term, err := emitEvent(ev)
						if err != nil {
							return err
						}
						if term {
							downstreamClosed = true
						}
					}
				}
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			return readErr
		}
	}

	if !downstreamClosed {
		for _, rec := range FlushSSEParseState(&parseSt) {
			for _, ev := range DecodeSSEStreamRecord(egress, rec, &decSt) {
				term, err := emitEvent(ev)
				if err != nil {
					return err
				}
				if term {
					downstreamClosed = true
				}
			}
		}
	}

	extras, err := enc.FinalizeClaudeUpstreamIdle()
	if err != nil {
		return err
	}
	if err := writeChunks(extras); err != nil {
		return err
	}
	respExtras, err := enc.FinalizeOpenAIResponsesUpstreamIdle()
	if err != nil {
		return err
	}
	if err := writeChunks(respExtras); err != nil {
		return err
	}
	tail, err := enc.FinalizeDrain()
	if err != nil {
		return err
	}
	return writeChunks(tail)
}

// WriteSSEFromBufferedIR mirrors Electron's ingressWantsSse branch materializing SSE from already-decoded upstream JSON payloads.
func WriteSSEFromBufferedIR(ingress apistyle.Style, prependModelFromIR string, events []ResponseEvent, w http.ResponseWriter) error {
	flush := streamFlushMaybe(w)
	enc := NewStreamIngressEncoder(ingress)
	writeChunks := func(chunks [][]byte) error {
		for _, bs := range chunks {
			if len(bs) == 0 {
				continue
			}
			if _, err := w.Write(bs); err != nil {
				return err
			}
			flush()
		}
		return nil
	}
	emitEvent := func(ev ResponseEvent) (terminal bool, err error) {
		chunks, done, encErr := enc.EncodeEvent(ev)
		if encErr != nil {
			return true, encErr
		}
		if err := writeChunks(chunks); err != nil {
			return true, err
		}
		return done, nil
	}

	if m := strings.TrimSpace(prependModelFromIR); m != "" && ingressStyleForResponse(ingress) != apistyle.OpenAIResponses {
		term, err := emitEvent(ResponseEvent{Type: RespMessageStart, Role: string(RoleAssistant), Model: m})
		if err != nil {
			return err
		}
		if term {
			return nil
		}
	}
	for _, ev := range events {
		term, err := emitEvent(ev)
		if err != nil {
			return err
		}
		if term {
			break
		}
	}
	extras, err := enc.FinalizeClaudeUpstreamIdle()
	if err != nil {
		return err
	}
	if err := writeChunks(extras); err != nil {
		return err
	}
	respExtras, err := enc.FinalizeOpenAIResponsesUpstreamIdle()
	if err != nil {
		return err
	}
	if err := writeChunks(respExtras); err != nil {
		return err
	}
	tail, err := enc.FinalizeDrain()
	if err != nil {
		return err
	}
	return writeChunks(tail)
}

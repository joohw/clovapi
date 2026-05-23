package protocol

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

var (
	// ErrUpstreamSSEForNonStreamingClient signals an upstream SSE response for a stream:false ingress request where the buffered non-stream finalize path applies.
	ErrUpstreamSSEForNonStreamingClient = errors.New(`upstream responded with text/event-stream for stream:false`)
)

// SanitizeUpstreamResponseHeaders mirrors Electron proxy-response-headers (strip compressor + framing headers before relay).
func SanitizeUpstreamResponseHeaders(src http.Header) http.Header {
	dst := http.Header{}
	for key, vv := range src {
		canonicalKey := http.CanonicalHeaderKey(key)
		lk := strings.ToLower(canonicalKey)
		if lk == "" {
			continue
		}
		switch lk {
		case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
			"content-length", "content-encoding":
			continue
		}
		dst[canonicalKey] = append([]string(nil), vv...)
	}
	return dst
}

// MergeMinimalJSONReplyHeaders emits only deterministic JSON sizing headers used for Electron error payloads (status>=400 paths).
func MergeMinimalJSONReplyHeaders(body []byte) http.Header {
	h := http.Header{}
	h.Set("Content-Type", "application/json")
	h.Set("Content-Length", strconv.Itoa(len(body)))
	return h
}

// MergeJSONSuccessHeaders overlays JSON identity headers while preserving sanitized upstream metadata (successful transcoded payloads).
func MergeJSONSuccessHeaders(sanitized http.Header, body []byte) http.Header {
	out := sanitized.Clone()
	out.Set("Content-Type", "application/json")
	out.Set("Content-Length", strconv.Itoa(len(body)))
	return out
}

// FinalizeNonStreamProxyDownstream decompresses upstream bodies and either passthrough-preserves ingress wire bytes or transcoding through the response IR bridge.
//
// Preconditions: callers must gate this helper for streaming=false client requests only; SSE upstream payloads are materialized into JSON for the ingress wire shape.
func FinalizeNonStreamProxyDownstream(
	ingress, egress apistyle.Style,
	status int,
	upstream http.Header,
	wireBody []byte,
) (int, http.Header, []byte, error) {
	ce := upstream.Get("Content-Encoding")
	decodedPlain, cerr := DecodeCompressedResponseBody(ce, wireBody)
	if cerr != nil {
		return 0, nil, nil, fmt.Errorf("decode upstream response body: %w", cerr)
	}

	baseSanitized := SanitizeUpstreamResponseHeaders(upstream)
	ctype := strings.ToLower(strings.TrimSpace(upstream.Get("Content-Type")))
	sseWire := strings.Contains(ctype, "text/event-stream") || LooksLikeSSEWire(decodedPlain)

	if ingress == egress && !sseWire {
		hdr := baseSanitized.Clone()
		hdr.Set("Content-Length", strconv.Itoa(len(decodedPlain)))
		return status, hdr, decodedPlain, nil
	}

	var ev []ResponseEvent
	if sseWire {
		ev = MaterializeSSEUpstreamEvents(egress, decodedPlain)
	} else {
		ev = MaterializePlainUpstreamEvents(egress, status, decodedPlain)
	}
	outJSON, encErr := EncodeNonStreamJSONResponseForStyle(ingress, ev)
	if encErr != nil {
		return 0, nil, nil, fmt.Errorf("encode ingress response: %w", encErr)
	}

	if status >= 400 {
		return status, MergeMinimalJSONReplyHeaders(outJSON), outJSON, nil
	}
	return status, MergeJSONSuccessHeaders(baseSanitized, outJSON), outJSON, nil
}

// MaterializePlainUpstreamEvents maps upstream plaintext bodies (decoded of compression elsewhere) into response IR slices (mirrors Electron JSON/SSE-materialize helpers).
func MaterializePlainUpstreamEvents(egress apistyle.Style, status int, plain []byte) []ResponseEvent {
	if len(plain) == 0 {
		if status >= 400 {
			return []ResponseEvent{upstreamHTTPError(status)}
		}
		return []ResponseEvent{{
			Type:    RespError,
			Message: "empty upstream response",
			Code:    UpstreamErrorCode,
		}}
	}

	ev, err := DecodeNonStreamJSONResponseForStyle(egress, plain)
	if err != nil {
		return []ResponseEvent{{
			Type:    RespError,
			Message: err.Error(),
			Code:    DecodeFailCode,
		}}
	}
	return ev
}

// MaterializeSSEUpstreamEvents parses a buffered upstream SSE plaintext body into response IR slices.
func MaterializeSSEUpstreamEvents(egress apistyle.Style, plain []byte) []ResponseEvent {
	if len(plain) == 0 {
		return []ResponseEvent{{
			Type:    RespError,
			Message: "empty upstream SSE response",
			Code:    UpstreamErrorCode,
		}}
	}
	parseSt := SSEParseState{}
	decSt := SSEUpstreamDecodeState{}
	var events []ResponseEvent
	for _, rec := range AppendParse(plain, &parseSt) {
		events = append(events, DecodeSSEStreamRecord(egress, rec, &decSt)...)
	}
	for _, rec := range FlushSSEParseState(&parseSt) {
		events = append(events, DecodeSSEStreamRecord(egress, rec, &decSt)...)
	}
	if len(events) == 0 {
		return []ResponseEvent{{
			Type:    RespError,
			Message: "upstream SSE response contained no decodable events",
			Code:    DecodeFailCode,
		}}
	}
	return events
}

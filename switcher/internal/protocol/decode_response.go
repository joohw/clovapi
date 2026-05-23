package protocol

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// DecodeNonStreamJSONResponseForStyle parses a successful JSON upstream body into response events using egress-shape decoders (Electron decodeResponseJson paths).
//
// Caller should pass decompressed plaintext JSON bytes.
func DecodeNonStreamJSONResponseForStyle(egress apistyle.Style, body []byte) ([]ResponseEvent, error) {
	style := egressStyleForResponse(egress)
	raw, err := jsonDecodeMap(body)
	if err != nil {
		return nil, err
	}
	switch style {
	case apistyle.Claude:
		return decodeClaudeResponseJSON(raw), nil
	case apistyle.OpenAIChat:
		return decodeOpenAIChatResponseJSON(raw), nil
	case apistyle.OpenAIResponses:
		return decodeOpenAIResponsesResponseJSON(raw), nil
	default:
		return nil, fmt.Errorf("unsupported egress style for response decoding: %s", egress)
	}
}

func egressStyleForResponse(egress apistyle.Style) apistyle.Style {
	if egress == apistyle.Gemini {
		return apistyle.OpenAIChat
	}
	return egress
}

func decodeClaudeResponseJSON(raw map[string]any) []ResponseEvent {
	if raw == nil {
		raw = map[string]any{}
	}
	// Anthropic-shaped error envelope (`type: error` OR nested `{ error: {...} }`)
	if typ := strings.TrimSpace(fmt.Sprint(raw["type"])); strings.EqualFold(typ, "error") || raw["error"] != nil {
		errPayload := envelopeError(raw["error"])
		if strings.TrimSpace(errPayload.message) == "" {
			errPayload.message = "upstream error"
		}
		return []ResponseEvent{{
			Type:    RespError,
			Message: errPayload.message,
			Code:    errPayload.code,
		}}
	}
	return wrapClaudeMessageEvents(raw)
}

func wrapClaudeMessageEvents(raw map[string]any) []ResponseEvent {
	model := strings.TrimSpace(fmt.Sprint(raw["model"]))
	events := []ResponseEvent{{Type: RespMessageStart, Role: string(RoleAssistant), Model: model}}

	blocks, _ := raw["content"].([]any)
	for _, item := range blocks {
		blk, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(blk["type"])) != "text" {
			continue
		}
		events = append(events, ResponseEvent{
			Type: RespTextDelta,
			Text: fmt.Sprint(blk["text"]),
		})
	}
	reason := strings.TrimSpace(fmt.Sprint(raw["stop_reason"]))
	if reason == "" {
		reason = "end_turn"
	}
	events = append(events, ResponseEvent{Type: RespFinish, Reason: reason})
	return events
}

type errorWire struct {
	message string
	code    string
}

func responseDetailError(raw map[string]any) ([]ResponseEvent, bool) {
	if raw == nil {
		return nil, false
	}
	detail := strings.TrimSpace(fmt.Sprint(raw["detail"]))
	if detail == "" || detail == "<nil>" {
		return nil, false
	}
	return []ResponseEvent{{
		Type:    RespError,
		Message: detail,
		Code:    "api_error",
	}}, true
}

func envelopeError(v any) errorWire {
	out := errorWire{}
	if v == nil {
		return out
	}
	switch t := v.(type) {
	case map[string]any:
		out.message = strings.TrimSpace(fmt.Sprint(t["message"]))
		out.code = strings.TrimSpace(fmt.Sprint(t["type"]))
	default:
		out.message = strings.TrimSpace(fmt.Sprint(t))
	}
	return out
}

func decodeOpenAIChatResponseJSON(raw map[string]any) []ResponseEvent {
	if raw == nil {
		raw = map[string]any{}
	}
	if ev, ok := responseDetailError(raw); ok {
		return ev
	}
	if errObj := raw["error"]; errObj != nil {
		em := envelopeError(errObj)
		if strings.TrimSpace(em.message) == "" {
			em.message = "upstream error"
		}
		return []ResponseEvent{{Type: RespError, Message: em.message, Code: em.code}}
	}
	choice := firstChoice(raw["choices"])
	msgMap, ok := choice["message"].(map[string]any)
	if !ok {
		msgMap = map[string]any{}
	}

	model := strings.TrimSpace(fmt.Sprint(raw["model"]))
	events := []ResponseEvent{
		{Type: RespMessageStart, Role: string(RoleAssistant), Model: model},
		{Type: RespTextDelta, Text: strings.TrimSpace(TextContent(msgMap["content"]))},
		{
			Type:   RespFinish,
			Reason: strings.TrimSpace(fmt.Sprint(coalesceFinishReasonOpenAIChat(choice))),
		},
	}
	if um, ok := raw["usage"].(map[string]any); ok && um != nil {
		var inTok, outTok int
		if n, ok := coerceIntPointer(um["prompt_tokens"]); ok {
			inTok = *n
		}
		if n, ok := coerceIntPointer(um["completion_tokens"]); ok {
			outTok = *n
		}
		if inTok != 0 || outTok != 0 {
			events = append(events, ResponseEvent{Type: RespUsage, InputTokens: inTok, OutputTokens: outTok})
		}
	}
	return events
}

func firstChoice(choicesAny any) map[string]any {
	arr, ok := choicesAny.([]any)
	if !ok || len(arr) == 0 {
		return map[string]any{}
	}
	first, ok := arr[0].(map[string]any)
	if !ok || first == nil {
		return map[string]any{}
	}
	return first
}

func coalesceFinishReasonOpenAIChat(choice map[string]any) string {
	fr := strings.TrimSpace(fmt.Sprint(choice["finish_reason"]))
	if fr != "" {
		return fr
	}
	return "stop"
}

func decodeOpenAIResponsesResponseJSON(raw map[string]any) []ResponseEvent {
	if raw == nil {
		raw = map[string]any{}
	}
	if ev, ok := responseDetailError(raw); ok {
		return ev
	}
	if errObj := raw["error"]; errObj != nil {
		em := envelopeError(errObj)
		if strings.TrimSpace(em.message) == "" {
			em.message = "upstream error"
		}
		return []ResponseEvent{{Type: RespError, Message: em.message, Code: em.code}}
	}
	model := strings.TrimSpace(fmt.Sprint(raw["model"]))
	out := ""
	items, _ := raw["output"].([]any)
	for _, item := range items {
		im, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(im["type"])) != "message" {
			continue
		}
		out += TextContent(im["content"])
	}
	status := strings.TrimSpace(fmt.Sprint(raw["status"]))
	if status == "" {
		status = "completed"
	}
	return []ResponseEvent{
		{Type: RespMessageStart, Role: string(RoleAssistant), Model: model},
		{Type: RespTextDelta, Text: strings.TrimSpace(out)},
		{Type: RespFinish, Reason: status},
	}
}

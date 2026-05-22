package protocol

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// SSEUpstreamDecodeState tracks partial decoder state across SSE records (Electron async generator locals).
type SSEUpstreamDecodeState struct {
	OpenAIChatStarted bool
	ResponsesStarted  bool
}

// DecodeSSEStreamRecord maps one parsed SSE wire record into normalized ResponseEvent slices using egress SSE semantics (Electron decodeSseStream per style).
func DecodeSSEStreamRecord(egress apistyle.Style, rec SSERecord, st *SSEUpstreamDecodeState) []ResponseEvent {
	style := egressStyleForResponse(egress)
	if st == nil {
		st = &SSEUpstreamDecodeState{}
	}
	switch style {
	case apistyle.Claude:
		return decodeClaudeSSERecord(rec)
	case apistyle.OpenAIChat:
		return decodeOpenAIChatSSERecord(rec, &st.OpenAIChatStarted)
	case apistyle.OpenAIResponses:
		return decodeOpenAIResponsesSSERecord(rec, &st.ResponsesStarted)
	default:
		return nil
	}
}

func decodeClaudeSSERecord(rec SSERecord) []ResponseEvent {
	if strings.TrimSpace(rec.Data) == "[DONE]" {
		return nil
	}
	payload, ok := sseJSONPayload(rec.Data)
	if !ok {
		return nil
	}
	return decodeClaudeStreamPayload(payload)
}

func decodeClaudeStreamPayload(payload map[string]any) []ResponseEvent {
	if sseIsClaudeWireError(payload) {
		em := sseClaudeErrorEnvelope(payload)
		if strings.TrimSpace(em.Message) == "" {
			em.Message = "upstream error"
		}
		return []ResponseEvent{em}
	}
	out := []ResponseEvent{}
	switch strings.TrimSpace(fmt.Sprint(payload["type"])) {
	case "message_start":
		model := ""
		if msg, ok := payload["message"].(map[string]any); ok && msg != nil {
			model = strings.TrimSpace(fmt.Sprint(msg["model"]))
		}
		out = append(out, ResponseEvent{Type: RespMessageStart, Role: string(RoleAssistant), Model: model})
	case "content_block_delta":
		text := sseClaudeDeltaText(payload)
		if text != "" {
			out = append(out, ResponseEvent{Type: RespTextDelta, Text: text})
		}
	case "message_delta":
		if dm, ok := payload["delta"].(map[string]any); ok && dm != nil {
			if sr := strings.TrimSpace(fmt.Sprint(dm["stop_reason"])); sr != "" {
				out = append(out, ResponseEvent{Type: RespFinish, Reason: sr})
			}
		}
	case "message_stop":
		out = append(out, ResponseEvent{Type: RespFinish, Reason: "end_turn"})
	}
	return out
}

func sseIsClaudeWireError(payload map[string]any) bool {
	t := strings.EqualFold(strings.TrimSpace(fmt.Sprint(payload["type"])), "error")
	return t || payload["error"] != nil
}

func sseClaudeErrorEnvelope(payload map[string]any) ResponseEvent {
	em := envelopeError(payload["error"])
	code := strings.TrimSpace(em.code)
	msg := strings.TrimSpace(em.message)
	if code == "" {
		code = strings.TrimSpace(fmt.Sprint(payload["type"]))
	}
	return ResponseEvent{
		Type:    RespError,
		Message: msg,
		Code:    code,
	}
}

func sseClaudeDeltaText(payload map[string]any) string {
	delta, ok := payload["delta"].(map[string]any)
	if !ok || delta == nil {
		return ""
	}
	txt := delta["text"]
	if txt != nil && fmt.Sprint(txt) != "<nil>" {
		return strings.TrimSpace(fmt.Sprint(txt))
	}
	if pj := delta["partial_json"]; pj != nil {
		return strings.TrimSpace(fmt.Sprint(pj))
	}
	return ""
}

func decodeOpenAIChatSSERecord(rec SSERecord, started *bool) []ResponseEvent {
	if strings.TrimSpace(rec.Data) == "[DONE]" {
		return []ResponseEvent{{Type: RespFinish, Reason: "stop"}}
	}
	payload, ok := sseJSONPayload(rec.Data)
	if !ok {
		return nil
	}
	out := []ResponseEvent{}
	if errObj, ok := payload["error"].(map[string]any); ok && errObj != nil {
		em := envelopeError(errObj)
		msg := strings.TrimSpace(em.message)
		if msg == "" {
			msg = "upstream error"
		}
		return []ResponseEvent{{Type: RespError, Message: msg, Code: strings.TrimSpace(em.code)}}
	}
	if !*started {
		*started = true
		out = append(out, ResponseEvent{Type: RespMessageStart, Role: string(RoleAssistant), Model: strings.TrimSpace(fmt.Sprint(payload["model"]))})
	}
	if choices, ok := payload["choices"].([]any); ok && len(choices) > 0 {
		cm, _ := choices[0].(map[string]any)
		if cm != nil {
			if dm, ok := cm["delta"].(map[string]any); ok && dm != nil {
				if ct := strings.TrimSpace(fmt.Sprint(dm["content"])); ct != "" {
					out = append(out, ResponseEvent{Type: RespTextDelta, Text: ct})
				}
			}
			if fr := strings.TrimSpace(fmt.Sprint(cm["finish_reason"])); fr != "" {
				out = append(out, ResponseEvent{Type: RespFinish, Reason: fr})
			}
		}
	}
	return out
}

func decodeOpenAIResponsesSSERecord(rec SSERecord, started *bool) []ResponseEvent {
	if strings.TrimSpace(rec.Data) == "[DONE]" {
		return []ResponseEvent{{Type: RespFinish, Reason: "completed"}}
	}
	payload, ok := sseJSONPayload(rec.Data)
	if !ok {
		return nil
	}
	out := []ResponseEvent{}
	if errObj, ok := payload["error"].(map[string]any); ok && errObj != nil {
		em := envelopeError(errObj)
		msg := strings.TrimSpace(em.message)
		if msg == "" {
			msg = "upstream error"
		}
		return []ResponseEvent{{Type: RespError, Message: msg, Code: strings.TrimSpace(em.code)}}
	}
	recordType := strings.TrimSpace(strings.ToLower(fmt.Sprint(payload["type"])))
	if recordType == "" && strings.TrimSpace(rec.Event) != "" {
		recordType = strings.TrimSpace(strings.ToLower(rec.Event))
	}
	if failed := responsesIsFailed(payload, recordType); failed != nil {
		return []ResponseEvent{*failed}
	}
	if !*started && (strings.Contains(recordType, "response") || payload["response"] != nil) {
		*started = true
		model := strings.TrimSpace(fmt.Sprint(payload["model"]))
		if rm, ok := payload["response"].(map[string]any); ok && rm != nil && strings.TrimSpace(fmt.Sprint(rm["model"])) != "" {
			model = strings.TrimSpace(fmt.Sprint(rm["model"]))
		}
		out = append(out, ResponseEvent{Type: RespMessageStart, Role: string(RoleAssistant), Model: model})
	}
	if strings.Contains(recordType, "output_text.delta") || strings.Contains(recordType, "text.delta") {
		txt := responsesExtractDeltaText(payload)
		if txt != "" {
			out = append(out, ResponseEvent{Type: RespTextDelta, Text: txt})
		}
	}
	if strings.Contains(recordType, "output_text.done") {
		txt := responsesExtractDeltaText(payload)
		if txt == "" {
			txt = strings.TrimSpace(responsesExtractResponseText(payload["response"]))
		}
		if txt == "" {
			txt = strings.TrimSpace(responsesExtractResponseText(payload))
		}
		if txt != "" {
			out = append(out, ResponseEvent{Type: RespTextDelta, Text: txt})
		}
	}
	if strings.Contains(recordType, "completed") || strings.TrimSpace(fmt.Sprint(payload["status"])) == "completed" {
		if resp := payload["response"]; resp != nil {
			txt := strings.TrimSpace(responsesExtractResponseText(resp))
			if txt != "" {
				out = append(out, ResponseEvent{Type: RespTextDelta, Text: txt})
			}
		}
		out = append(out, ResponseEvent{Type: RespFinish, Reason: "completed"})
	}
	return out
}

func responsesIsFailed(payload map[string]any, recordType string) *ResponseEvent {
	if strings.Contains(recordType, "failed") || strings.TrimSpace(fmt.Sprint(payload["status"])) == "failed" {
		msg := ""
		code := ""
		if rsp, ok := payload["response"].(map[string]any); ok && rsp != nil {
			if nested, ok := rsp["error"].(map[string]any); ok && nested != nil {
				em := envelopeError(nested)
				msg, code = em.message, em.code
			}
		}
		if strings.TrimSpace(msg) == "" {
			if nested, ok := payload["error"].(map[string]any); ok && nested != nil {
				em := envelopeError(nested)
				msg, code = em.message, em.code
			}
		}
		if strings.TrimSpace(msg) == "" {
			msg = "upstream failed"
		}
		return &ResponseEvent{Type: RespError, Message: strings.TrimSpace(msg), Code: strings.TrimSpace(code)}
	}
	return nil
}

func responsesExtractDeltaText(payload map[string]any) string {
	if d, ok := payload["delta"]; ok {
		switch v := d.(type) {
		case string:
			return v
		case map[string]any:
			if v == nil {
				return ""
			}
			for _, k := range []string{"text", "content", "value"} {
				if s := strings.TrimSpace(fmt.Sprint(v[k])); s != "" {
					return s
				}
			}
			return ""
		default:
			return strings.TrimSpace(fmt.Sprint(v))
		}
	}
	for _, k := range []string{"text", "output_text"} {
		if s := strings.TrimSpace(fmt.Sprint(payload[k])); s != "" {
			return s
		}
	}
	return ""
}

func responsesExtractResponseText(v any) string {
	raw, ok := v.(map[string]any)
	if !ok || raw == nil {
		return ""
	}
	items, ok := raw["output"].([]any)
	if !ok {
		return ""
	}
	txt := ""
	for _, item := range items {
		im, ok := item.(map[string]any)
		if !ok || im == nil || strings.TrimSpace(fmt.Sprint(im["type"])) != "message" {
			continue
		}
		txt += TextContent(im["content"])
	}
	return txt
}

func sseJSONPayload(data string) (map[string]any, bool) {
	data = strings.TrimSpace(data)
	if data == "" {
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(data), &payload); err != nil || payload == nil {
		return nil, false
	}
	return payload, true
}

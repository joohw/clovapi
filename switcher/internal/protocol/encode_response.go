package protocol

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// EncodeNonStreamJSONResponse encodes ingress-shaped JSON completions for non-streaming proxy responses (Electron encodeResponseJson).
func EncodeNonStreamJSONResponseForStyle(ingress apistyle.Style, events []ResponseEvent) ([]byte, error) {
	switch ingressStyleForResponse(ingress) {
	case apistyle.Claude:
		return encodeResponseClaude(events)
	case apistyle.OpenAIChat:
		return encodeResponseOpenAIChat(events)
	case apistyle.OpenAIResponses:
		return encodeResponseOpenAIResponses(events)
	default:
		return nil, fmt.Errorf("unsupported ingress style for response encoding: %s", ingress)
	}
}

func ingressStyleForResponse(style apistyle.Style) apistyle.Style {
	if style == apistyle.Gemini {
		return apistyle.OpenAIChat
	}
	return style
}

func findError(events []ResponseEvent) (*ResponseEvent, bool) {
	for i := range events {
		if events[i].Type == RespError {
			return &events[i], true
		}
	}
	return nil, false
}

func foldText(events []ResponseEvent) (text string, finish string, model string, usageIn *ResponseEvent, hasFinish bool) {
	finish = "stop"
	model = ""
	for _, e := range events {
		switch e.Type {
		case RespTextDelta:
			text += e.Text
		case RespFinish:
			hasFinish = true
			if strings.TrimSpace(e.Reason) != "" {
				finish = strings.TrimSpace(e.Reason)
			}
		case RespMessageStart:
			if strings.TrimSpace(e.Model) != "" {
				model = strings.TrimSpace(e.Model)
			}
		case RespUsage:
			ev := e
			usageIn = &ev
		}
	}
	return text, finish, model, usageIn, hasFinish
}

func encodeResponseOpenAIChat(events []ResponseEvent) ([]byte, error) {
	if errEvt, ok := findError(events); ok {
		return json.Marshal(map[string]any{"error": errorOpenAIEnvelope(errEvt)})
	}
	text, finish, model, usage, _ := foldText(events)
	payload := map[string]any{
		"id":     "chatcmpl-proxy",
		"object": "chat.completion",
		"model":  model,
		"choices": []map[string]any{
			{
				"index": 0,
				"message": map[string]string{
					"role":    string(RoleAssistant),
					"content": text,
				},
				"finish_reason": finishOpenAINormalize(finish),
			},
		},
	}
	if usage != nil {
		payload["usage"] = map[string]any{
			"prompt_tokens":     usage.InputTokens,
			"completion_tokens": usage.OutputTokens,
			"total_tokens":      usage.InputTokens + usage.OutputTokens,
		}
	}
	return json.Marshal(payload)
}

func finishOpenAINormalize(reason string) string {
	r := strings.TrimSpace(strings.ToLower(reason))
	switch r {
	case "end_turn", "stop_sequence":
		return "stop"
	default:
		if reason == "" {
			return "stop"
		}
		return strings.TrimSpace(reason)
	}
}

func errorOpenAIEnvelope(e *ResponseEvent) map[string]any {
	typ := strings.TrimSpace(e.Code)
	if typ == "" || typ == UpstreamErrorCode {
		typ = "api_error"
	}
	return map[string]any{"message": e.Message, "type": typ}
}

func encodeResponseOpenAIResponses(events []ResponseEvent) ([]byte, error) {
	if errEvt, ok := findError(events); ok {
		return json.Marshal(map[string]any{"error": errorOpenAIEnvelope(errEvt)})
	}
	text, _, _, _, _ := foldText(events)
	return json.Marshal(map[string]any{
		"id":     "resp_proxy",
		"object": "response",
		"status": "completed",
		"output": []map[string]any{
			{
				"type": "message",
				"role": string(RoleAssistant),
				"content": []map[string]string{
					{"type": "output_text", "text": text},
				},
			},
		},
	})
}

func encodeResponseClaude(events []ResponseEvent) ([]byte, error) {
	if errEvt, ok := findError(events); ok {
		typ := strings.TrimSpace(errEvt.Code)
		if typ == "" {
			typ = "api_error"
		}
		return json.Marshal(map[string]any{
			"type": "error",
			"error": map[string]any{
				"type": typ, "message": errEvt.Message,
			},
		})
	}

	text, finish, model, _, _ := foldText(events)
	if strings.TrimSpace(finish) == "" {
		finish = "end_turn"
	}
	return json.Marshal(map[string]any{
		"id":          "msg_proxy",
		"type":        "message",
		"role":        string(RoleAssistant),
		"model":       model,
		"content":     []map[string]string{{"type": "text", "text": text}},
		"stop_reason": finishClaudeNormalize(finish),
	})
}

func finishClaudeNormalize(reason string) string {
	switch strings.TrimSpace(strings.ToLower(reason)) {
	case "completed", "stop":
		return "end_turn"
	default:
		if strings.TrimSpace(reason) == "" {
			return "end_turn"
		}
		return strings.TrimSpace(reason)
	}
}

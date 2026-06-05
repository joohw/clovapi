package protocol

import (
	"encoding/json"
	"fmt"
	"strings"
)

var openAIResponsesKnownRequestKeys = map[string]struct{}{
	"model":             {},
	"input":             {},
	"stream":            {},
	"max_output_tokens": {},
	"max_tokens":        {},
	"temperature":       {},
	"instructions":      {},
	"tools":             {},
}

// DecodeRequestOpenAIResponses decodes OpenAI Responses-shaped JSON body to IR with extension preservation.
func DecodeRequestOpenAIResponses(body []byte) (Request, error) {
	raw, err := jsonDecodeMap(body)
	if err != nil {
		return Request{}, fmt.Errorf("decode openai-responses request: %w", err)
	}
	var streamPtr *bool
	if v, ok := raw["stream"]; ok {
		b := coerceBoolPreferTrueDefault(v)
		streamPtr = &b
	}

	var maxTok *int
	switch {
	case raw["max_output_tokens"] != nil:
		if n, ok := coerceIntPointer(raw["max_output_tokens"]); ok {
			maxTok = n
		}
	case raw["max_tokens"] != nil:
		if n, ok := coerceIntPointer(raw["max_tokens"]); ok {
			maxTok = n
		}
	}

	var tempPtr *float64
	if v, ok := raw["temperature"]; ok && v != nil {
		if f, ok := coerceFloatPointer(v); ok {
			tempPtr = &f
		}
	}

	instructions := jsonStringField(raw, "instructions")
	meta := &Metadata{Instructions: instructions}

	slots, msgs, inputExt, systemParts := decodeResponsesInputSlots(raw["input"])
	if len(systemParts) > 0 {
		systemText := strings.Join(systemParts, "\n\n")
		if existing := strings.TrimSpace(meta.System); existing != "" {
			meta.System = existing + "\n\n" + systemText
		} else {
			meta.System = systemText
		}
	}
	tools, _ := mapTools(raw["tools"])

	var extensions []ExtensionNode
	extensions = append(extensions, inputExt...)
	for key, value := range raw {
		if _, known := openAIResponsesKnownRequestKeys[key]; known {
			continue
		}
		ext, err := requestFieldExtension(key, value)
		if err != nil {
			return Request{}, fmt.Errorf("preserve request field %q: %w", key, err)
		}
		extensions = append(extensions, ext)
	}

	return Request{
		Model:       jsonStringField(raw, "model"),
		Messages:    msgs,
		InputSlots:  slots,
		Stream:      streamDefault(streamPtr),
		Tools:       tools,
		MaxTokens:   maxTok,
		Temperature: tempPtr,
		Meta:        meta,
		Extensions:  extensions,
	}, nil
}

func decodeResponsesInputSlots(input any) ([]InputSlot, []Message, []ExtensionNode, []string) {
	slots := make([]InputSlot, 0)
	msgs := make([]Message, 0)
	var extensions []ExtensionNode
	systemParts := make([]string, 0)
	if input == nil {
		return slots, msgs, extensions, systemParts
	}
	if s, ok := input.(string); ok {
		s = strings.TrimSpace(s)
		if s == "" {
			return slots, msgs, extensions, systemParts
		}
		msg := Message{Role: RoleUser, Content: s}
		slots = append(slots, InputSlot{Message: &msg})
		msgs = append(msgs, msg)
		payload, _ := json.Marshal(s)
		extensions = append(extensions, ExtensionNode{Kind: ExtOpenAIResponsesInputString, Payload: payload})
		return slots, msgs, extensions, systemParts
	}
	arr, ok := input.([]any)
	if !ok || len(arr) == 0 {
		return slots, msgs, extensions, systemParts
	}
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		typ := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["type"])))
		if _, hasType := m["type"]; !hasType {
			typ = ""
		}
		switch typ {
		case "", "message":
			role := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["role"])))
			if role == "" {
				role = "user"
			}
			content := strings.TrimSpace(TextContent(m["content"]))
			if isSystemLikeRole(role) {
				if content != "" {
					systemParts = append(systemParts, content)
				}
				continue
			}
			msg := Message{Role: Role(role), Content: content}
			if cparts, hasImage := decodeContentParts(m["content"]); hasImage {
				msg.Parts = cparts
			}
			msgCopy := msg
			slots = append(slots, InputSlot{Message: &msgCopy})
			msgs = append(msgs, msg)
		case "input_text", "text":
			tx := strings.TrimSpace(TextContent(m["text"]))
			if tx == "" {
				tx = strings.TrimSpace(TextContent(m["content"]))
			}
			if tx == "" {
				continue
			}
			msg := Message{Role: RoleUser, Content: tx}
			msgCopy := msg
			slots = append(slots, InputSlot{Message: &msgCopy})
			msgs = append(msgs, msg)
		case "function_call":
			if tc := toolCallFromResponsesItem(m); tc != nil {
				slots = append(slots, InputSlot{ToolCall: tc})
				continue
			}
		case "function_call_output":
			if tr := toolResultFromResponsesItem(m); tr != nil {
				slots = append(slots, InputSlot{ToolResult: tr})
				continue
			}
		default:
			ext, err := inputItemExtension(m)
			if err != nil {
				continue
			}
			slots = append(slots, InputSlot{Extension: ext})
		}
	}
	return slots, msgs, extensions, systemParts
}

func responsesInputWireFromIR(r Request) any {
	if len(r.InputSlots) > 0 {
		out := make([]any, 0, len(r.InputSlots))
		for _, slot := range r.InputSlots {
			if item, ok := inputSlotToResponsesWire(slot); ok {
				out = append(out, item)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	if arr := messagesToResponsesInputArray(r.Messages); len(arr) > 0 {
		return arr
	}
	for _, ext := range r.Extensions {
		if ext.Kind == ExtOpenAIResponsesInputString {
			var s string
			if json.Unmarshal(ext.Payload, &s) == nil {
				s = strings.TrimSpace(s)
				if s != "" {
					return []any{messageToResponsesInputItem(Message{Role: RoleUser, Content: s})}
				}
			}
		}
	}
	return []any{}
}

func messageToResponsesInputItem(m Message) map[string]any {
	content := strings.TrimSpace(m.Content)
	role := strings.ToLower(strings.TrimSpace(string(m.Role)))
	if role == "" {
		role = string(RoleUser)
	}
	if parts, hasImage := responsesContentParts(m); hasImage {
		return map[string]any{"type": "message", "role": role, "content": parts}
	}
	return map[string]any{
		"type": "message",
		"role": role,
		"content": []map[string]any{{
			"type": responsesMessageContentType(m.Role),
			"text": content,
		}},
	}
}

func messagesToResponsesInputArray(msgs []Message) []any {
	out := make([]any, 0, len(msgs))
	for _, m := range msgs {
		if isSystemLikeRole(string(m.Role)) {
			continue
		}
		if strings.TrimSpace(m.Content) == "" && !messageHasImage(m) {
			continue
		}
		out = append(out, messageToResponsesInputItem(m))
	}
	return out
}

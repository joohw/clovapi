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

	slots, msgs, inputExt := decodeResponsesInputSlots(raw["input"])
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

func decodeResponsesInputSlots(input any) ([]InputSlot, []Message, []ExtensionNode) {
	slots := make([]InputSlot, 0)
	msgs := make([]Message, 0)
	var extensions []ExtensionNode
	if input == nil {
		return slots, msgs, extensions
	}
	if s, ok := input.(string); ok {
		s = strings.TrimSpace(s)
		if s == "" {
			return slots, msgs, extensions
		}
		msg := Message{Role: RoleUser, Content: s}
		slots = append(slots, InputSlot{Message: &msg})
		msgs = append(msgs, msg)
		payload, _ := json.Marshal(s)
		extensions = append(extensions, ExtensionNode{Kind: ExtOpenAIResponsesInputString, Payload: payload})
		return slots, msgs, extensions
	}
	arr, ok := input.([]any)
	if !ok || len(arr) == 0 {
		return slots, msgs, extensions
	}
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		typ := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["type"])))
		switch typ {
		case "message":
			role := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["role"])))
			if role == "" {
				role = "user"
			}
			msg := Message{Role: Role(role), Content: strings.TrimSpace(TextContent(m["content"]))}
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
		default:
			ext, err := inputItemExtension(m)
			if err != nil {
				continue
			}
			slots = append(slots, InputSlot{Extension: ext})
		}
	}
	return slots, msgs, extensions
}

func responsesInputWireFromIR(r Request) any {
	for _, ext := range r.Extensions {
		if ext.Kind == ExtOpenAIResponsesInputString {
			var s string
			if json.Unmarshal(ext.Payload, &s) == nil {
				return s
			}
		}
	}
	if len(r.InputSlots) > 0 {
		out := make([]any, 0, len(r.InputSlots))
		for _, slot := range r.InputSlots {
			if slot.Message != nil {
				out = append(out, messageToResponsesInputItem(*slot.Message))
				continue
			}
			if slot.Extension != nil && slot.Extension.Kind == ExtOpenAIResponsesInputItem {
				var item map[string]any
				if json.Unmarshal(slot.Extension.Payload, &item) == nil && item != nil {
					out = append(out, item)
				}
			}
		}
		return out
	}
	return messagesToResponsesInputArray(r.Messages)
}

func messageToResponsesInputItem(m Message) map[string]any {
	content := strings.TrimSpace(m.Content)
	if content == "" {
		content = ""
	}
	role := strings.ToLower(strings.TrimSpace(string(m.Role)))
	if role == "" {
		role = string(RoleUser)
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
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		out = append(out, messageToResponsesInputItem(m))
	}
	return out
}

func applyRequestFieldExtensions(body map[string]any, extensions []ExtensionNode) error {
	for _, ext := range extensions {
		if ext.Kind != ExtOpenAIResponsesRequestField {
			continue
		}
		var field RequestFieldPayload
		if err := json.Unmarshal(ext.Payload, &field); err != nil {
			return err
		}
		key := strings.TrimSpace(field.Key)
		if key == "" {
			continue
		}
		var value any
		if err := json.Unmarshal(field.Value, &value); err != nil {
			return err
		}
		body[key] = value
	}
	return nil
}

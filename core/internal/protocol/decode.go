package protocol

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func jsonStringField(raw map[string]any, key string) string {
	if raw == nil {
		return ""
	}
	s, ok := raw[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func mapTools(raw any) ([]Tool, error) {
	arr, ok := raw.([]any)
	if !ok || len(arr) == 0 {
		return nil, nil
	}
	out := make([]Tool, 0, len(arr))
	for _, item := range arr {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fn, ok := entry["function"].(map[string]any)
		if !ok {
			fn = entry
		}
		name, _ := fn["name"].(string)
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		t := Tool{Name: name}
		if d, ok := fn["description"].(string); ok {
			t.Description = d
		}
		if p, ok := fn["parameters"].(map[string]any); ok && p != nil {
			t.Parameters = p
		} else {
			t.Parameters = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		out = append(out, t)
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

// DecodeRequestClaude decodes Claude Messages-shaped JSON body to IR.
func DecodeRequestClaude(body []byte) (Request, error) {
	raw, err := jsonDecodeMap(body)
	if err != nil {
		return Request{}, fmt.Errorf("decode claude request: %w", err)
	}
	var streamPtr *bool
	if v, ok := raw["stream"]; ok {
		b := coerceBoolPreferTrueDefault(v)
		streamPtr = &b
	}
	msgsAny, _ := raw["messages"].([]any)
	msgList, sys := PartitionSystemMessages(msgsAny, raw["system"])
	inputSlots := decodeClaudeInputSlots(msgsAny)
	tools, _ := mapClaudeTools(raw["tools"])
	var meta *Metadata
	if sys != "" {
		meta = &Metadata{System: sys}
	}
	var maxTok *int
	if v, ok := raw["max_tokens"]; ok && v != nil {
		if n, ok := coerceIntPointer(v); ok {
			maxTok = n
		}
	}
	var tempPtr *float64
	if v, ok := raw["temperature"]; ok && v != nil {
		if f, ok := coerceFloatPointer(v); ok {
			tempPtr = &f
		}
	}
	req := NewRequest(jsonStringField(raw, "model"), msgList, streamDefault(streamPtr), maxTok, tempPtr, meta)
	req.InputSlots = inputSlots
	req.Tools = tools
	if err := appendClaudeRequestFieldExtensions(&req, raw); err != nil {
		return Request{}, err
	}
	return req, nil
}

// DecodeRequestOpenAIChat decodes OpenAI Chat Completions JSON body to IR.
func DecodeRequestOpenAIChat(body []byte) (Request, error) {
	raw, err := jsonDecodeMap(body)
	if err != nil {
		return Request{}, fmt.Errorf("decode openai-chat request: %w", err)
	}
	var streamPtr *bool
	if v, ok := raw["stream"]; ok {
		b := coerceBoolPreferTrueDefault(v)
		streamPtr = &b
	}
	msgsAny, _ := raw["messages"].([]any)
	msgList, sys := PartitionSystemMessages(msgsAny, raw["system"])
	tools, _ := mapTools(raw["tools"])
	var meta *Metadata
	if sys != "" {
		meta = &Metadata{System: sys}
	}
	var maxTok *int
	if v, ok := raw["max_tokens"]; ok && v != nil {
		if n, ok := coerceIntPointer(v); ok {
			maxTok = n
		}
	}
	var tempPtr *float64
	if v, ok := raw["temperature"]; ok && v != nil {
		if f, ok := coerceFloatPointer(v); ok {
			tempPtr = &f
		}
	}
	req := Request{
		Model:       jsonStringField(raw, "model"),
		Messages:    msgList,
		Stream:      streamDefault(streamPtr),
		Tools:       tools,
		MaxTokens:   maxTok,
		Temperature: tempPtr,
		Meta:        meta,
	}
	// Preserve assistant tool_calls and tool-result turns as ordered InputSlots so
	// they survive transcoding to Claude/Responses. The flat Messages list cannot
	// represent tool invocations; without this the entire tool conversation is lost.
	if openAIChatMessagesHaveTools(msgsAny) {
		req.InputSlots = decodeOpenAIChatInputSlots(msgsAny)
	}
	return req, nil
}

// openAIChatMessagesHaveTools reports whether the conversation contains assistant
// tool_calls or tool-role result turns that the flat Messages list cannot encode.
func openAIChatMessagesHaveTools(messages []any) bool {
	for _, raw := range messages {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["role"])))
		if role == "tool" {
			return true
		}
		if arr, ok := m["tool_calls"].([]any); ok && len(arr) > 0 {
			return true
		}
	}
	return false
}

// decodeOpenAIChatInputSlots converts OpenAI Chat messages into ordered IR slots,
// splitting assistant turns into text + tool-call slots and mapping tool-role
// messages to tool-result slots. System/developer turns are intentionally
// omitted (they are captured as Metadata.System by PartitionSystemMessages, and
// CollectSystemPrompt would otherwise double-count them).
func decodeOpenAIChatInputSlots(messages []any) []InputSlot {
	slots := make([]InputSlot, 0, len(messages))
	for _, raw := range messages {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["role"])))
		if role == "" {
			role = string(RoleUser)
		}
		if isSystemLikeRole(role) {
			continue
		}
		switch role {
		case "tool":
			tr := &ToolResult{
				CallID: strings.TrimSpace(fmt.Sprint(m["tool_call_id"])),
				Output: strings.TrimSpace(TextContent(m["content"])),
			}
			if tr.Output == "" && m["content"] != nil {
				tr.Output = strings.TrimSpace(fmt.Sprint(m["content"]))
			}
			if tr.CallID != "" {
				slots = append(slots, InputSlot{ToolResult: tr})
			}
		case string(RoleAssistant):
			if text := strings.TrimSpace(TextContent(m["content"])); text != "" {
				msg := Message{Role: RoleAssistant, Content: text}
				slots = append(slots, InputSlot{Message: &msg})
			}
			if arr, ok := m["tool_calls"].([]any); ok {
				for _, rawCall := range arr {
					if tc := openAIChatToolCall(rawCall); tc != nil {
						slots = append(slots, InputSlot{ToolCall: tc})
					}
				}
			}
		default:
			text := strings.TrimSpace(TextContent(m["content"]))
			if text == "" && m["content"] != nil {
				if _, isArr := m["content"].([]any); !isArr {
					text = strings.TrimSpace(fmt.Sprint(m["content"]))
				}
			}
			msg := Message{Role: Role(role), Content: text}
			if v, ok := m["name"]; ok && v != nil {
				msg.Name = strings.TrimSpace(fmt.Sprint(v))
			}
			slots = append(slots, InputSlot{Message: &msg})
		}
	}
	return slots
}

func openAIChatToolCall(raw any) *ToolCall {
	call, ok := raw.(map[string]any)
	if !ok {
		return nil
	}
	id := strings.TrimSpace(fmt.Sprint(call["id"]))
	fn, _ := call["function"].(map[string]any)
	if fn == nil {
		return nil
	}
	name := strings.TrimSpace(fmt.Sprint(fn["name"]))
	if id == "" || name == "" {
		return nil
	}
	args := "{}"
	switch a := fn["arguments"].(type) {
	case string:
		if s := strings.TrimSpace(a); s != "" {
			args = s
		}
	case nil:
		// keep default
	default:
		if b, err := json.Marshal(a); err == nil {
			args = string(b)
		}
	}
	return &ToolCall{ID: id, Name: name, Arguments: args}
}

// DecodeRequestOpenAIResponses decodes OpenAI Responses-shaped JSON body to IR.
// Implementation lives in decode_responses_ext.go (extension-preserving decode).

func coerceBoolPreferTrueDefault(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		if b, err := strconv.ParseBool(strings.TrimSpace(x)); err == nil {
			return b
		}
		return strings.TrimSpace(x) != ""
	case float64:
		return x != 0
	default:
		return true
	}
}

func coerceIntPointer(v any) (*int, bool) {
	switch x := v.(type) {
	case float64:
		n := int(x)
		return &n, true
	case json.Number:
		i64, err := x.Int64()
		if err != nil {
			return nil, false
		}
		n := int(i64)
		return &n, true
	case int:
		return &x, true
	case int64:
		n := int(x)
		return &n, true
	case string:
		i64, err := strconv.ParseInt(strings.TrimSpace(x), 10, 64)
		if err != nil {
			return nil, false
		}
		n := int(i64)
		return &n, true
	default:
		return nil, false
	}
}

func coerceFloatPointer(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

// JSONDecodeRequest is decodeRequest with Decoder.UseNumber support (optional path).
func jsonDecodeMap(body []byte) (map[string]any, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var raw map[string]any
	if err := dec.Decode(&raw); err != nil {
		return nil, err
	}
	if raw == nil {
		raw = map[string]any{}
	}
	return raw, nil
}

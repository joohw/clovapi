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
	req.Tools = tools
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
	return Request{
		Model:       jsonStringField(raw, "model"),
		Messages:    msgList,
		Stream:      streamDefault(streamPtr),
		Tools:       tools,
		MaxTokens:   maxTok,
		Temperature: tempPtr,
		Meta:        meta,
	}, nil
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

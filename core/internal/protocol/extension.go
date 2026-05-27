package protocol

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ExtensionNode carries wire-specific payload that is preserved losslessly through IR.
// Encode expands a node only when the target style supports Kind (see capability.go).
type ExtensionNode struct {
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload"`
}

// InputSlot preserves ordered conversation items in portable IR.
type InputSlot struct {
	Message    *Message
	ToolCall   *ToolCall
	ToolResult *ToolResult
	Extension  *ExtensionNode // unknown wire-only items not mapped to IR
}

// Extension kind identifiers (ingress wire semantics).
const (
	ExtOpenAIResponsesInputItem    = "openai_responses.input_item"
	ExtOpenAIResponsesInputString  = "openai_responses.input_string"
	ExtOpenAIResponsesRequestField = "openai_responses.request_field"
	ExtOpenAIResponsesSSEEvent     = "openai_responses.sse_event"
	ExtAnthropicSSEEvent           = "anthropic.sse_event"
	ExtAnthropicRequestField       = "anthropic.request_field"
)

// WireSSEPayload is the canonical payload for SSE extension nodes.
type WireSSEPayload struct {
	Event string `json:"event"`
	Data  string `json:"data"`
}

// RequestFieldPayload carries a preserved top-level request field.
type RequestFieldPayload struct {
	Key   string          `json:"key"`
	Value json.RawMessage `json:"value"`
}

// UnsupportedExtensionError is returned when egress/ingress cannot expand an extension kind.
type UnsupportedExtensionError struct {
	Kind  string
	Style string
}

func (e UnsupportedExtensionError) Error() string {
	return fmt.Sprintf("style %q does not support extension kind %q", e.Style, e.Kind)
}

func wireExtension(kind string, rec SSERecord) ResponseEvent {
	payload, _ := json.Marshal(WireSSEPayload{
		Event: rec.Event,
		Data:  rec.Data,
	})
	return ResponseEvent{
		Type:      RespWireExtension,
		Extension: &ExtensionNode{Kind: kind, Payload: payload},
	}
}

func inputItemExtension(item map[string]any) (*ExtensionNode, error) {
	payload, err := json.Marshal(item)
	if err != nil {
		return nil, err
	}
	return &ExtensionNode{Kind: ExtOpenAIResponsesInputItem, Payload: payload}, nil
}

func requestFieldExtension(key string, value any) (ExtensionNode, error) {
	return requestFieldExtensionForKind(ExtOpenAIResponsesRequestField, key, value)
}

func requestFieldExtensionForKind(kind, key string, value any) (ExtensionNode, error) {
	valueJSON, err := json.Marshal(value)
	if err != nil {
		return ExtensionNode{}, err
	}
	payload, err := json.Marshal(RequestFieldPayload{Key: key, Value: valueJSON})
	if err != nil {
		return ExtensionNode{}, err
	}
	return ExtensionNode{Kind: kind, Payload: payload}, nil
}

func applyRequestFieldExtensions(body map[string]any, extensions []ExtensionNode, kinds ...string) error {
	allowed := map[string]struct{}{}
	for _, kind := range kinds {
		allowed[kind] = struct{}{}
	}
	for _, ext := range extensions {
		if _, ok := allowed[ext.Kind]; !ok {
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

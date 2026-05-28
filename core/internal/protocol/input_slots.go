package protocol

import (
	"encoding/json"
	"fmt"
	"strings"
)

func toolCallFromClaudeBlock(block map[string]any) *ToolCall {
	id := strings.TrimSpace(fmt.Sprint(block["id"]))
	name := strings.TrimSpace(fmt.Sprint(block["name"]))
	if id == "" || name == "" {
		return nil
	}
	args := "{}"
	if block["input"] != nil {
		if b, err := json.Marshal(block["input"]); err == nil {
			args = string(b)
		}
	}
	return &ToolCall{ID: id, Name: name, Arguments: args}
}

func toolResultFromClaudeBlock(block map[string]any) *ToolResult {
	id := strings.TrimSpace(fmt.Sprint(block["tool_use_id"]))
	if id == "" {
		return nil
	}
	output := strings.TrimSpace(TextContent(block["content"]))
	if output == "" && block["content"] != nil {
		output = strings.TrimSpace(fmt.Sprint(block["content"]))
	}
	return &ToolResult{CallID: id, Output: output}
}

func toolCallFromResponsesItem(item map[string]any) *ToolCall {
	if strings.TrimSpace(fmt.Sprint(item["type"])) != "function_call" {
		return nil
	}
	id := strings.TrimSpace(fmt.Sprint(item["call_id"]))
	name := strings.TrimSpace(fmt.Sprint(item["name"]))
	if id == "" || name == "" {
		return nil
	}
	args := strings.TrimSpace(fmt.Sprint(item["arguments"]))
	if args == "" {
		args = "{}"
	}
	return &ToolCall{ID: id, Name: name, Arguments: args}
}

func toolResultFromResponsesItem(item map[string]any) *ToolResult {
	if strings.TrimSpace(fmt.Sprint(item["type"])) != "function_call_output" {
		return nil
	}
	id := strings.TrimSpace(fmt.Sprint(item["call_id"]))
	if id == "" {
		return nil
	}
	output := strings.TrimSpace(TextContent(item["output"]))
	if output == "" {
		output = strings.TrimSpace(fmt.Sprint(item["output"]))
	}
	return &ToolResult{CallID: id, Output: output}
}

func inputSlotToResponsesWire(slot InputSlot) (any, bool) {
	if slot.Message != nil {
		return messageToResponsesInputItem(*slot.Message), true
	}
	if slot.ToolCall != nil {
		return map[string]any{
			"type":      "function_call",
			"call_id":   slot.ToolCall.ID,
			"name":      slot.ToolCall.Name,
			"arguments": toolCallArgumentsOrEmpty(slot.ToolCall),
		}, true
	}
	if slot.ToolResult != nil {
		return map[string]any{
			"type":    "function_call_output",
			"call_id": slot.ToolResult.CallID,
			"output":  slot.ToolResult.Output,
		}, true
	}
	if slot.Extension != nil && slot.Extension.Kind == ExtOpenAIResponsesInputItem {
		var item map[string]any
		if json.Unmarshal(slot.Extension.Payload, &item) == nil && item != nil {
			return item, true
		}
	}
	return nil, false
}

func toolCallArgumentsOrEmpty(tc *ToolCall) string {
	if tc == nil {
		return "{}"
	}
	args := strings.TrimSpace(tc.Arguments)
	if args == "" {
		return "{}"
	}
	return args
}

func claudeToolUseBlock(tc *ToolCall) map[string]any {
	block := map[string]any{
		"type": "tool_use",
		"id":   tc.ID,
		"name": tc.Name,
	}
	var input any
	if args := strings.TrimSpace(tc.Arguments); args != "" {
		_ = json.Unmarshal([]byte(args), &input)
	}
	if input == nil {
		input = map[string]any{}
	}
	block["input"] = input
	return block
}

func claudeToolResultBlock(tr *ToolResult) map[string]any {
	content := strings.TrimSpace(tr.Output)
	block := map[string]any{
		"type":        "tool_result",
		"tool_use_id": tr.CallID,
	}
	if content == "" {
		block["content"] = ""
	} else {
		block["content"] = []map[string]any{{"type": "text", "text": content}}
	}
	return block
}

func claudeMessagesWireFromInputSlots(slots []InputSlot) []map[string]any {
	out := make([]map[string]any, 0)
	var blocks []map[string]any
	var role string
	flush := func() {
		if len(blocks) == 0 {
			return
		}
		out = append(out, map[string]any{"role": role, "content": blocks})
		blocks = nil
	}
	for _, slot := range slots {
		switch {
		case slot.Message != nil:
			r := strings.ToLower(strings.TrimSpace(string(slot.Message.Role)))
			if isSystemLikeRole(r) {
				continue
			}
			if r == "" {
				r = string(RoleUser)
			}
			if role != "" && role != r {
				flush()
			}
			role = r
			if text := strings.TrimSpace(slot.Message.Content); text != "" {
				blocks = append(blocks, map[string]any{"type": "text", "text": text})
			}
		case slot.ToolCall != nil:
			if role != string(RoleAssistant) {
				flush()
				role = string(RoleAssistant)
			}
			blocks = append(blocks, claudeToolUseBlock(slot.ToolCall))
		case slot.ToolResult != nil:
			if role != string(RoleUser) {
				flush()
				role = string(RoleUser)
			}
			blocks = append(blocks, claudeToolResultBlock(slot.ToolResult))
		case slot.Extension != nil:
			if msg, ok := portableMessageFromInputExtension(slot.Extension); ok {
				r := strings.ToLower(string(msg.Role))
				if role != "" && role != r {
					flush()
				}
				role = r
				if text := strings.TrimSpace(msg.Content); text != "" {
					blocks = append(blocks, map[string]any{"type": "text", "text": text})
				}
			}
		}
	}
	flush()
	return out
}

func openAIChatMessagesFromInputSlots(slots []InputSlot) []map[string]any {
	out := make([]map[string]any, 0)
	for _, slot := range slots {
		switch {
		case slot.Message != nil:
			if isSystemLikeRole(string(slot.Message.Role)) {
				continue
			}
			msg := map[string]any{
				"role":    string(slot.Message.Role),
				"content": slot.Message.Content,
			}
			if id := strings.TrimSpace(slot.Message.ToolCallID); id != "" {
				msg["tool_call_id"] = id
			}
			if name := strings.TrimSpace(slot.Message.Name); name != "" {
				msg["name"] = name
			}
			out = append(out, msg)
		case slot.ToolCall != nil:
			out = append(out, map[string]any{
				"role": string(RoleAssistant),
				"tool_calls": []map[string]any{{
					"id":   slot.ToolCall.ID,
					"type": "function",
					"function": map[string]any{
						"name":      slot.ToolCall.Name,
						"arguments": toolCallArgumentsOrEmpty(slot.ToolCall),
					},
				}},
			})
		case slot.ToolResult != nil:
			out = append(out, map[string]any{
				"role":         string(RoleTool),
				"tool_call_id": slot.ToolResult.CallID,
				"content":      slot.ToolResult.Output,
			})
		case slot.Extension != nil:
			if msg, ok := portableMessageFromInputExtension(slot.Extension); ok {
				out = append(out, map[string]any{
					"role":    string(msg.Role),
					"content": msg.Content,
				})
			}
		}
	}
	return out
}

func requestHasToolInputSlots(slots []InputSlot) bool {
	for _, slot := range slots {
		if slot.ToolCall != nil || slot.ToolResult != nil {
			return true
		}
	}
	return false
}

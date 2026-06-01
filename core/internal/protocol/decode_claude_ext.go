package protocol

import (
	"fmt"
	"strings"
)

var claudeKnownRequestKeys = map[string]struct{}{
	"model":       {},
	"messages":    {},
	"stream":      {},
	"max_tokens":  {},
	"temperature": {},
	"system":      {},
	"tools":       {},
}

func appendClaudeRequestFieldExtensions(req *Request, raw map[string]any) error {
	if req == nil || raw == nil {
		return nil
	}
	for key, value := range raw {
		if !claudeRequestFieldNeedsPreservation(key, value) {
			continue
		}
		ext, err := requestFieldExtensionForKind(ExtAnthropicRequestField, key, value)
		if err != nil {
			return fmt.Errorf("preserve request field %q: %w", key, err)
		}
		req.Extensions = append(req.Extensions, ext)
	}
	return nil
}

func claudeRequestFieldNeedsPreservation(key string, value any) bool {
	if _, known := claudeKnownRequestKeys[key]; !known {
		return true
	}
	switch key {
	case "system":
		return !isSimpleClaudeSystemWire(value)
	case "messages":
		return !isSimpleClaudeMessagesWire(value)
	case "tools":
		return !isSimpleClaudeToolsWire(value)
	default:
		return false
	}
}

func isSimpleClaudeSystemWire(value any) bool {
	if value == nil {
		return true
	}
	switch v := value.(type) {
	case string:
		return true
	case []any:
		for _, item := range v {
			block, ok := item.(map[string]any)
			if !ok || !isSimpleClaudeTextBlock(block) {
				return false
			}
		}
		return len(v) > 0
	default:
		return false
	}
}

func isSimpleClaudeMessagesWire(value any) bool {
	arr, ok := value.([]any)
	if !ok {
		return value == nil
	}
	for _, item := range arr {
		msg, ok := item.(map[string]any)
		if !ok {
			return false
		}
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(msg["role"])))
		if role != string(RoleUser) && role != string(RoleAssistant) {
			return false
		}
		if !isSimpleClaudeMessageContent(msg["content"]) {
			return false
		}
		for field := range msg {
			if field != "role" && field != "content" {
				return false
			}
		}
	}
	return true
}

func isSimpleClaudeMessageContent(content any) bool {
	if content == nil {
		return true
	}
	switch v := content.(type) {
	case string:
		return true
	case []any:
		for _, item := range v {
			block, ok := item.(map[string]any)
			if !ok || !isSimpleClaudeTextBlock(block) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func isSimpleClaudeTextBlock(block map[string]any) bool {
	if block == nil {
		return false
	}
	if strings.TrimSpace(fmt.Sprint(block["type"])) != "text" {
		return false
	}
	if _, ok := block["text"]; !ok {
		return false
	}
	for field := range block {
		if field != "type" && field != "text" {
			return false
		}
	}
	return true
}

func isSimpleClaudeToolsWire(value any) bool {
	arr, ok := value.([]any)
	if !ok {
		return value == nil
	}
	allowedToolKeys := map[string]struct{}{
		"name": {}, "description": {}, "input_schema": {}, "parameters": {}, "type": {}, "function": {},
	}
	for _, item := range arr {
		entry, ok := item.(map[string]any)
		if !ok {
			return false
		}
		if fn, ok := entry["function"].(map[string]any); ok && fn != nil {
			entry = fn
		}
		for field := range entry {
			if _, ok := allowedToolKeys[field]; !ok {
				return false
			}
		}
	}
	return true
}

func decodeClaudeInputSlots(messages []any) []InputSlot {
	slots := make([]InputSlot, 0)
	for _, raw := range messages {
		msg, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(msg["role"])))
		if role == "" {
			role = string(RoleUser)
		}
		if isSystemLikeRole(role) {
			continue
		}
		content := msg["content"]
		blocks, ok := content.([]any)
		if !ok {
			text := strings.TrimSpace(TextContent(content))
			if text != "" {
				m := Message{Role: Role(role), Content: text}
				slots = append(slots, InputSlot{Message: &m})
			}
			continue
		}
		var textParts []string
		var parts []ContentPart
		var hasImage bool
		flushText := func() {
			text := strings.TrimSpace(strings.Join(filterNonEmpty(textParts), "\n"))
			collected := parts
			imageSeen := hasImage
			textParts = nil
			parts = nil
			hasImage = false
			if text == "" && !imageSeen {
				return
			}
			m := Message{Role: Role(role), Content: text}
			if imageSeen {
				m.Parts = collected
			}
			slots = append(slots, InputSlot{Message: &m})
		}
		for _, rawBlock := range blocks {
			block, ok := rawBlock.(map[string]any)
			if !ok {
				continue
			}
			switch strings.TrimSpace(fmt.Sprint(block["type"])) {
			case "text":
				if text := strings.TrimSpace(TextContent(block["text"])); text != "" {
					textParts = append(textParts, text)
					parts = append(parts, ContentPart{Type: "text", Text: text})
				}
			case "image":
				if img := claudeImagePart(block["source"]); img != nil {
					parts = append(parts, ContentPart{Type: "image", Image: img})
					hasImage = true
				}
			case "tool_use":
				flushText()
				if tc := toolCallFromClaudeBlock(block); tc != nil {
					slots = append(slots, InputSlot{ToolCall: tc})
				}
			case "tool_result":
				flushText()
				if tr := toolResultFromClaudeBlock(block); tr != nil {
					slots = append(slots, InputSlot{ToolResult: tr})
				}
			default:
				if text := strings.TrimSpace(TextContent(block)); text != "" {
					textParts = append(textParts, text)
				}
			}
		}
		flushText()
	}
	return slots
}

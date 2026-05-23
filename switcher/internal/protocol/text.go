package protocol

import (
	"encoding/json"
	"fmt"
	"strings"
)

// TextContent mirrors Electron protocol/ir.textContent for string/array/object fragments.
func TextContent(value any) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			part, ok := item.(map[string]any)
			if !ok {
				continue
			}
			typ := strings.TrimSpace(fmt.Sprint(part["type"]))
			if typ == "text" || typ == "input_text" || typ == "output_text" {
				parts = append(parts, strings.TrimSpace(fmt.Sprint(part["text"])))
			}
		}
		return strings.Join(filterNonEmpty(parts), "\n")
	default:
		// Fallback: marshal unknown shapes to inspect common fields
		if m, ok := v.(map[string]any); ok {
			return TextContent(m["text"])
		}
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

// SystemText mirrors Electron systemText().
func SystemText(value any) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			switch x := item.(type) {
			case string:
				if t := strings.TrimSpace(x); t != "" {
					parts = append(parts, t)
				}
			case map[string]any:
				parts = append(parts, strings.TrimSpace(TextContent(x["text"])))
				if parts[len(parts)-1] == "" {
					parts = parts[:len(parts)-1]
				}
			}
		}
		return strings.Join(filterNonEmpty(parts), "\n\n")
	case map[string]any:
		return strings.TrimSpace(TextContent(v["text"]))
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

// PartitionSystemMessages splits system-role turns into concatenated top-level system text.
func PartitionSystemMessages(messages []any, extraSystem any) ([]Message, string) {
	apiMessages := make([]Message, 0)
	systemParts := make([]string, 0)
	if s := SystemText(extraSystem); s != "" {
		systemParts = append(systemParts, s)
	}
	for _, raw := range messages {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["role"])))
		if role == "" {
			role = "user"
		}
		if role == "system" {
			if tx := strings.TrimSpace(TextContent(m["content"])); tx != "" {
				systemParts = append(systemParts, tx)
			}
			continue
		}
		if role == "user" || role == "assistant" || role == "tool" {
			entry := Message{
				Role:    Role(role),
				Content: strings.TrimSpace(TextContent(m["content"])),
			}
			if v, ok := m["tool_call_id"]; ok && v != nil {
				entry.ToolCallID = strings.TrimSpace(fmt.Sprint(v))
			}
			if v, ok := m["name"]; ok && v != nil {
				entry.Name = strings.TrimSpace(fmt.Sprint(v))
			}
			apiMessages = append(apiMessages, entry)
		}
	}
	system := ""
	if len(systemParts) > 0 {
		system = strings.Join(systemParts, "\n\n")
	}
	return apiMessages, system
}

// CollectSystemPrompt mirrors Electron collectSystemPrompt (metadata.system + system-role messages).
func CollectSystemPrompt(r Request) string {
	parts := make([]string, 0)
	if r.Meta != nil {
		if s := strings.TrimSpace(r.Meta.System); s != "" {
			parts = append(parts, s)
		}
	}
	for _, m := range r.Messages {
		if strings.ToLower(strings.TrimSpace(string(m.Role))) != "system" {
			continue
		}
		if tx := strings.TrimSpace(m.Content); tx != "" {
			parts = append(parts, tx)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n\n")
}

func filterNonEmpty(in []string) []string {
	out := in[:0]
	for _, s := range in {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func streamDefault(ptr *bool) bool {
	if ptr == nil {
		return false
	}
	return *ptr
}

func jsonNumberFloat(n json.Number) (float64, bool) {
	f, err := n.Float64()
	return f, err == nil
}

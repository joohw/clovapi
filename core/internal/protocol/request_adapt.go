package protocol

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// AdaptRequestForEgress lowers wire-specific ingress details into portable
// message context before encoding to a style that cannot preserve the original
// extension losslessly.
func AdaptRequestForEgress(r *Request, egress apistyle.Style) {
	if r == nil {
		return
	}
	style := egressStyleForResponse(egress)
	if style == apistyle.OpenAIResponses {
		return
	}
	if len(r.InputSlots) > 0 {
		messages := make([]Message, 0, len(r.InputSlots))
		for _, slot := range r.InputSlots {
			if slot.Message != nil {
				messages = append(messages, *slot.Message)
				continue
			}
			if msg, ok := portableMessageFromInputExtension(slot.Extension); ok {
				messages = append(messages, msg)
			}
		}
		if len(messages) > 0 {
			r.Messages = messages
		}
		r.InputSlots = nil
	}
	r.Extensions = filterRequestExtensionsForEgress(style, r.Extensions)
}

func filterRequestExtensionsForEgress(style apistyle.Style, extensions []ExtensionNode) []ExtensionNode {
	if len(extensions) == 0 {
		return nil
	}
	out := extensions[:0]
	for _, ext := range extensions {
		switch ext.Kind {
		case ExtOpenAIResponsesInputString, ExtOpenAIResponsesRequestField:
			continue
		default:
			if extensionSupportedByStyle(style, ext.Kind) {
				out = append(out, ext)
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func portableMessageFromInputExtension(ext *ExtensionNode) (Message, bool) {
	if ext == nil || ext.Kind != ExtOpenAIResponsesInputItem {
		return Message{}, false
	}
	var item map[string]any
	if err := json.Unmarshal(ext.Payload, &item); err != nil || item == nil {
		return Message{}, false
	}
	typ := strings.ToLower(strings.TrimSpace(fmt.Sprint(item["type"])))
	switch typ {
	case "function_call":
		name := strings.TrimSpace(fmt.Sprint(item["name"]))
		args := strings.TrimSpace(fmt.Sprint(item["arguments"]))
		text := strings.TrimSpace("tool call " + name)
		if args != "" {
			text += " arguments " + args
		}
		return Message{Role: RoleAssistant, Content: text}, true
	case "function_call_output":
		output := strings.TrimSpace(TextContent(item["output"]))
		if output == "" {
			output = strings.TrimSpace(fmt.Sprint(item["output"]))
		}
		if output == "" {
			return Message{}, false
		}
		return Message{Role: RoleUser, Content: "tool response " + output}, true
	default:
		text := strings.TrimSpace(TextContent(item["content"]))
		if text == "" {
			text = strings.TrimSpace(TextContent(item["text"]))
		}
		if text == "" {
			text = strings.TrimSpace(TextContent(item["output"]))
		}
		if text == "" {
			return Message{}, false
		}
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(item["role"])))
		if role != string(RoleAssistant) {
			role = string(RoleUser)
		}
		return Message{Role: Role(role), Content: text}, true
	}
}

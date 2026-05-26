package protocol

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// ExtensionSupportedByEgress reports whether an egress encoder may expand kind.
func ExtensionSupportedByEgress(egress apistyle.Style, kind string) bool {
	return extensionSupportedByStyle(egressStyleForResponse(egress), kind)
}

// ExtensionSupportedByIngress reports whether an ingress SSE/JSON encoder may expand kind.
func ExtensionSupportedByIngress(ingress apistyle.Style, kind string) bool {
	return extensionSupportedByStyle(ingressStyleForResponse(ingress), kind)
}

func extensionSupportedByStyle(style apistyle.Style, kind string) bool {
	kind = strings.TrimSpace(kind)
	if kind == "" {
		return false
	}
	switch style {
	case apistyle.OpenAIResponses:
		return strings.HasPrefix(kind, "openai_responses.")
	case apistyle.Claude:
		return strings.HasPrefix(kind, "anthropic.")
	case apistyle.OpenAIChat, apistyle.Gemini:
		return strings.HasPrefix(kind, "openai_chat.")
	default:
		return false
	}
}

// ValidateRequestExtensionsForEgress fails when IR carries extensions the egress style cannot emit.
func ValidateRequestExtensionsForEgress(egress apistyle.Style, r Request) error {
	style := egressStyleForResponse(egress)
	for _, slot := range r.InputSlots {
		if slot.Extension == nil {
			continue
		}
		if !extensionSupportedByStyle(style, slot.Extension.Kind) {
			return UnsupportedExtensionError{Kind: slot.Extension.Kind, Style: string(style)}
		}
	}
	for _, ext := range r.Extensions {
		if ext.Kind == ExtOpenAIResponsesInputString || ext.Kind == ExtOpenAIResponsesRequestField {
			continue
		}
		if !extensionSupportedByStyle(style, ext.Kind) {
			return UnsupportedExtensionError{Kind: ext.Kind, Style: string(style)}
		}
	}
	return nil
}

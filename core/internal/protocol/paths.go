package protocol

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// DefaultUpstreamPathSuffix mirrors electron/protocol/paths.js defaultUpstreamPathSuffix.
func DefaultUpstreamPathSuffix(egress apistyle.Style, upstreamSource string) string {
	if strings.TrimSpace(upstreamSource) == "subscription:codex" {
		return "/codex/responses"
	}
	switch egress {
	case apistyle.Claude:
		return "/messages"
	case apistyle.OpenAIResponses:
		return "/responses"
	default:
		return "/chat/completions"
	}
}

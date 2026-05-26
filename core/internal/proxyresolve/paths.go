package proxyresolve

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// UpstreamPathSuffix returns the ingress-stripped upstream HTTP path for a
// resolved route. Subscription-specific endpoints belong with proxy routing,
// not the protocol IR/transcoding package.
func UpstreamPathSuffix(egress apistyle.Style, upstreamSource string) string {
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

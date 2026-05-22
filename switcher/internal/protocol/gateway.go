package protocol

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// UpstreamHints is the upstream-side metadata used by Electron enrichIrRequest.
type UpstreamHints struct {
	Model  string // effective wire model; overrides IR when non-empty.
	Source string // e.g. subscription:codex, subscription:claude-code, local:ollama, model:name
}

// GatewayEnrich mutates IR like electron/protocol/gateway.enrichIrRequest.
func GatewayEnrich(r *Request, h UpstreamHints) {
	model := strings.TrimSpace(h.Model)
	if model != "" {
		r.Model = model
	}
	switch strings.TrimSpace(h.Source) {
	case "subscription:codex":
		meta := ensureMeta(r)
		meta.CodexSubscription = true
	case "subscription:claude-code":
		meta := ensureMeta(r)
		meta.SubscriptionClaudeOAuth = true
	}
}

// ResolveUpstreamPath returns the ingress-stripped suffix for the upstream HTTP path.
func ResolveUpstreamPath(egress apistyle.Style, _ Request, upstreamSource string) string {
	return DefaultUpstreamPathSuffix(egress, upstreamSource)
}

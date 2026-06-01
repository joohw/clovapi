package proxyresolve

import (
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

const (
	claudeOAuthUserAgent = "claude-cli/2.1.126 (external, cli)"
	claudeOAuthBeta      = "claude-code-20250219,interleaved-thinking-2025-05-14,redact-thinking-2026-02-12,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advisor-tool-2026-03-01,effort-2025-11-24"
)

// UpstreamAuth carries outbound credential metadata for upstream HTTP calls.
type UpstreamAuth struct {
	Style     apistyle.Style
	APIKey    string
	Source    string // e.g. subscription:codex, subscription:claude-code
	AccountID string // ChatGPT account id for Codex subscription upstream
	Stream    bool   // upstream request uses stream:true (SSE Accept for Claude OAuth)
}

// UpstreamAuthHeaders constructs provider auth headers (no Content-Type/body secrets).
//
// Mirrors the intent of electron/proxy-resolver buildUpstreamAuthHeaders; OAuth-ish Claude tokens
// get Bearer + Claude Code beta knobs instead of raw x-api-key.
func UpstreamAuthHeaders(a UpstreamAuth) http.Header {
	h := http.Header{}
	key := strings.TrimSpace(a.APIKey)
	switch a.Style {
	case apistyle.Claude:
		if key == "" {
			return h
		}
		if LooksLikeClaudeOAuthToken(key) {
			h.Set("Authorization", "Bearer "+key)
			h.Set("anthropic-version", "2023-06-01")
			h.Set("anthropic-beta", claudeOAuthBeta)
			h.Set("anthropic-dangerous-direct-browser-access", "true")
			h.Set("user-agent", claudeOAuthUserAgent)
			h.Set("x-app", "cli")
			h.Set("x-stainless-arch", "arm64")
			h.Set("x-stainless-lang", "js")
			h.Set("x-stainless-os", "MacOS")
			h.Set("x-stainless-package-version", "0.81.0")
			h.Set("x-stainless-retry-count", "0")
			h.Set("x-stainless-runtime", "node")
			h.Set("x-stainless-runtime-version", "v24.3.0")
			h.Set("x-stainless-timeout", "600")
			h.Set("Accept", "application/json")
			return h
		}
		h.Set("x-api-key", key)
		h.Set("anthropic-version", "2023-06-01")
		return h
	case apistyle.OpenAIResponses:
		if key != "" {
			h.Set("Authorization", "Bearer "+key)
		}
		h.Set("OpenAI-Beta", "responses=experimental")
		h.Set("Originator", "clovapi")
		if strings.TrimSpace(a.Source) == "subscription:codex" {
			if accountID := strings.TrimSpace(a.AccountID); accountID != "" {
				h.Set("chatgpt-account-id", accountID)
			}
			// Codex subscription upstream streams SSE for Responses requests.
			h.Set("Accept", "text/event-stream")
			return h
		}
		// Negotiate structured responses; streamed upstream bodies are decoded and transcoded by the relay when ingress requests stream:true.
		h.Set("Accept", "application/json")
		return h
	default:
		if key != "" {
			h.Set("Authorization", "Bearer "+key)
		}
		return h
	}
}

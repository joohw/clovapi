package proxyresolve

import (
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

const claudeOAuthUserAgent = "claude-cli/2.1.75"

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
			h.Set("anthropic-beta", "claude-code-20250219,oauth-2025-04-20")
			h.Set("anthropic-dangerous-direct-browser-access", "true")
			h.Set("user-agent", claudeOAuthUserAgent)
			if strings.TrimSpace(a.Source) == "subscription:claude-code" {
				h.Set("x-app", "claude-code")
			} else {
				h.Set("x-app", "cli")
			}
			if a.Stream {
				h.Set("Accept", "text/event-stream")
			} else {
				h.Set("Accept", "application/json")
			}
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
			// Codex subscription always streams SSE; match Electron codex-backend probe headers.
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

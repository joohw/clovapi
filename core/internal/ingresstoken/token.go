package ingresstoken

import (
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
)

const (
	Prefix = "clovapi--"
	Legacy = "clovapi-local"
)

// Auth carries a parsed local proxy ingress bearer token.
type Auth struct {
	Token string
	Agent agentkind.Kind
}

// ForAgent returns the bearer token written into agent configs for local proxy ingress.
func ForAgent(kind agentkind.Kind) string {
	if slug := agentSlug(kind); slug != "" {
		return Prefix + slug
	}
	return Legacy
}

func agentSlug(kind agentkind.Kind) string {
	switch kind {
	case agentkind.ClaudeCode:
		return "claude-code"
	case agentkind.ClaudeDesktop:
		return "claude-desktop"
	case agentkind.Codex:
		return "codex"
	case agentkind.OpenCode:
		return "opencode"
	case agentkind.OpenClaw:
		return "openclaw"
	case agentkind.Hermes:
		return "hermes"
	case agentkind.KimiCode:
		return "kimi-code"
	default:
		return ""
	}
}

// FromHTTPRequest parses Authorization: Bearer … from an inbound proxy request.
func FromHTTPRequest(r *http.Request) Auth {
	if r == nil {
		return Auth{}
	}
	return ParseBearer(r.Header.Get("Authorization"))
}

// ParseBearer extracts a clovapi ingress token from an Authorization header value.
func ParseBearer(authHeader string) Auth {
	auth := strings.TrimSpace(authHeader)
	if auth == "" {
		return Auth{}
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) && !strings.HasPrefix(auth, "bearer ") {
		return Auth{}
	}
	token := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(auth, "Bearer "), "bearer "))
	return ParseToken(token)
}

// ParseToken maps clovapi ingress tokens to agent kinds.
func ParseToken(token string) Auth {
	token = strings.TrimSpace(token)
	if token == "" {
		return Auth{}
	}
	if token == Legacy {
		return Auth{Token: token}
	}
	if !strings.HasPrefix(token, Prefix) {
		return Auth{}
	}
	slug := strings.TrimSpace(strings.TrimPrefix(token, Prefix))
	if slug == "" {
		return Auth{Token: token}
	}
	kind, err := agentkind.Parse(slug)
	if err != nil {
		return Auth{Token: token}
	}
	return Auth{Token: token, Agent: kind}
}

// IsClovapiToken reports whether token is a recognized local proxy ingress bearer value.
func IsClovapiToken(token string) bool {
	token = strings.TrimSpace(token)
	return token == Legacy || strings.HasPrefix(token, Prefix)
}

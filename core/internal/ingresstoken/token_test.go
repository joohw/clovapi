package ingresstoken

import (
	"net/http"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
)

func TestForAgentUsesAgentSlug(t *testing.T) {
	if got := ForAgent(agentkind.ClaudeDesktop); got != "clovapi--claude-desktop" {
		t.Fatalf("token = %q", got)
	}
	if got := ForAgent(agentkind.Codex); got != "clovapi--codex" {
		t.Fatalf("token = %q", got)
	}
}

func TestParseTokenRecognizesAgentAndLegacy(t *testing.T) {
	auth := ParseBearer("Bearer clovapi--claude-desktop")
	if auth.Token != "clovapi--claude-desktop" || auth.Agent != agentkind.ClaudeDesktop {
		t.Fatalf("auth = %+v", auth)
	}
	auth = ParseToken(Legacy)
	if auth.Token != Legacy || auth.Agent != "" {
		t.Fatalf("legacy = %+v", auth)
	}
}

func TestFromHTTPRequest(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://127.0.0.1:27483/codex/v1/models", nil)
	req.Header.Set("Authorization", "Bearer clovapi--hermes")
	auth := FromHTTPRequest(req)
	if auth.Agent != agentkind.Hermes {
		t.Fatalf("auth = %+v", auth)
	}
}

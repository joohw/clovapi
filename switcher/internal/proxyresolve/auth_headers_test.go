package proxyresolve_test

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/proxyresolve"
)

func TestUpstreamAuthHeadersClaudeVersusOAuth(t *testing.T) {
	api := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:  apistyle.Claude,
		APIKey: "secret",
	})
	if got := api.Get("x-api-key"); got != "secret" || api.Get("Authorization") != "" {
		t.Fatalf("api key scheme unexpected: %+v", api)
	}

	oauth := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:  apistyle.Claude,
		APIKey: "prefix sk-ant-oat token",
	})
	if got := oauth.Get("x-api-key"); got != "" {
		t.Fatal("oauth should not populate x-api-key")
	}
	if oauth.Get("Authorization") == "" || oauth.Get("anthropic-beta") == "" {
		t.Fatalf("oauth headers missing %+v", oauth)
	}

	resp := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:  apistyle.OpenAIResponses,
		APIKey: "bear",
	})
	if resp.Get("Authorization") != "Bearer bear" || resp.Get("OpenAI-Beta") == "" || resp.Get("Accept") != "application/json" {
		t.Fatalf("responses extras missing: %+v", resp)
	}
}

func TestUpstreamAuthHeadersCodexSubscriptionAccount(t *testing.T) {
	h := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:     apistyle.OpenAIResponses,
		APIKey:    "codex-token",
		Source:    "subscription:codex",
		AccountID: "acct-123",
	})
	if h.Get("chatgpt-account-id") != "acct-123" {
		t.Fatalf("chatgpt-account-id = %q", h.Get("chatgpt-account-id"))
	}
	if h.Get("Authorization") != "Bearer codex-token" {
		t.Fatalf("authorization = %q", h.Get("Authorization"))
	}
}

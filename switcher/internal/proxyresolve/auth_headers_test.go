package proxyresolve_test

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/proxyresolve"
)

func TestUpstreamAuthHeadersClaudeVersusOAuth(t *testing.T) {
	api := proxyresolve.UpstreamAuthHeaders(apistyle.Claude, "secret")
	if got := api.Get("x-api-key"); got != "secret" || api.Get("Authorization") != "" {
		t.Fatalf("api key scheme unexpected: %+v", api)
	}

	oauth := proxyresolve.UpstreamAuthHeaders(apistyle.Claude, "prefix sk-ant-oat token")
	if got := oauth.Get("x-api-key"); got != "" {
		t.Fatal("oauth should not populate x-api-key")
	}
	if oauth.Get("Authorization") == "" || oauth.Get("anthropic-beta") == "" {
		t.Fatalf("oauth headers missing %+v", oauth)
	}

	resp := proxyresolve.UpstreamAuthHeaders(apistyle.OpenAIResponses, "bear")
	if resp.Get("Authorization") != "Bearer bear" || resp.Get("OpenAI-Beta") == "" || resp.Get("Accept") != "application/json" {
		t.Fatalf("responses extras missing: %+v", resp)
	}
}

package proxyresolve_test

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
)

func TestJoinURLDedupV1Suffix(t *testing.T) {
	if got := proxyresolve.JoinURL("https://api.anthropic.com", "/messages"); got != "https://api.anthropic.com/v1/messages" {
		t.Fatalf("anthropic plain base should gain /v1: %q", got)
	}
	if got := proxyresolve.JoinURL("https://api.anthropic.com/v1", "/messages"); got != "https://api.anthropic.com/v1/messages" {
		t.Fatalf("anthropic+v1+suff = %q", got)
	}
	if got := proxyresolve.JoinURL("https://example.test/v1", "/v1/messages"); got != "https://example.test/v1/messages" {
		t.Fatalf("dedupe /v1 mismatch: %q", got)
	}
	if got := proxyresolve.JoinURL("https://chatgpt.com/backend-api", "/codex/responses"); got != "https://chatgpt.com/backend-api/codex/responses" {
		t.Fatalf("codex path mismatch: %q", got)
	}
}

func TestDefaultUpstreamCodexResponsesPath(t *testing.T) {
	if got := protocol.DefaultUpstreamPathSuffix(apistyle.OpenAIResponses, "subscription:codex"); got != "/codex/responses" {
		t.Fatalf("%q", got)
	}
	if got := protocol.DefaultUpstreamPathSuffix(apistyle.OpenAIResponses, "profile:x"); got != "/responses" {
		t.Fatalf("%q", got)
	}
}

func TestResolveIngressContextCustomAPIVendor(t *testing.T) {
	s := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:         provider.CustomAPIVendorName,
			Kind:         "api",
			ModelAdapter: "manual",
			Models: []profile.Model{{
				ID:       "gpt-5.5",
				Model:    "gpt-5.5-wire",
				APIStyle: apistyle.OpenAIResponses,
				BaseURL:  "https://gateway.test/",
				APIKey:   "sk-integration-secret-not-logged",
			}},
		}},
	}
	ctx, err := proxyresolve.ResolveIngressContext(s, "custom-api", "gpt-5.5", "openai-chat")
	if err != nil {
		t.Fatal(err)
	}
	wantBinding := provider.ModelBindingForProvider("custom-api", "gpt-5.5")
	if ctx.Binding != wantBinding {
		t.Fatalf("binding = %q want %q", ctx.Binding, wantBinding)
	}
	if ctx.IngressStyle != apistyle.OpenAIChat || ctx.EgressStyle != apistyle.OpenAIResponses {
		t.Fatalf("styles ingress=%v egress=%v", ctx.IngressStyle, ctx.EgressStyle)
	}
	wantURL := proxyresolve.JoinURL(proxyresolve.NormalizeBaseURL("https://gateway.test/"), ctx.PathSuffix)
	if ctx.BaseURLJoined != wantURL {
		t.Fatalf("joined url got %q want %q", ctx.BaseURLJoined, wantURL)
	}
	if ctx.AuthSummary.Scheme != "responses_codex_headers" {
		t.Fatalf("scheme = %+v", ctx.AuthSummary.Scheme)
	}
}

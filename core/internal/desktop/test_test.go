package desktop

import (
	"testing"

	"github.com/clovapi/switcher/internal/profile"
)

func TestProxyConfigForTestAppliesDefaultsAndOverride(t *testing.T) {
	cfg := proxyConfigForTest(&profile.Store{
		Proxy: profile.ProxyConfig{Host: "", Port: 1234},
	}, 5678)

	if cfg.Host != profile.DefaultProxyHost {
		t.Fatalf("Host = %q, want %q", cfg.Host, profile.DefaultProxyHost)
	}
	if cfg.Port != 5678 {
		t.Fatalf("Port = %d, want 5678", cfg.Port)
	}
}

func TestProxyHealthURLUsesReachableLoopback(t *testing.T) {
	got := proxyHealthURL(profile.ProxyConfig{Host: "0.0.0.0", Port: 27483})
	want := "http://127.0.0.1:27483/health"
	if got != want {
		t.Fatalf("proxyHealthURL = %q, want %q", got, want)
	}
}

func TestProxyHealthURLBracketsIPv6(t *testing.T) {
	got := proxyHealthURL(profile.ProxyConfig{Host: "::1", Port: 27483})
	want := "http://[::1]:27483/health"
	if got != want {
		t.Fatalf("proxyHealthURL = %q, want %q", got, want)
	}
}

func TestClaudeSubscriptionActiveRequiresPaidPlan(t *testing.T) {
	if providerSubscriptionActive("claude-code", true, map[string]any{
		"claudeAiOauth": map[string]any{"subscriptionType": "Free"},
	}) {
		t.Fatalf("free Claude account should not be active")
	}
	if !providerSubscriptionActive("claude-code", true, map[string]any{
		"claudeAiOauth": map[string]any{"subscriptionType": "Max"},
	}) {
		t.Fatalf("paid Claude account should be active")
	}
}

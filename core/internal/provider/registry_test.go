package provider

import "testing"

func TestRegistryMatchesDesktopFixedProviders(t *testing.T) {
	ids := FixedProviderIDs()
	want := []string{"claude-code", "codex", "ollama", "custom-api"}
	if len(ids) != len(want) {
		t.Fatalf("provider count = %d, want %d (%v)", len(ids), len(want), ids)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("ids[%d] = %q, want %q", i, ids[i], want[i])
		}
	}

	if got := VendorNameFromProviderID("claude-code"); got != ClaudeCodeVendorName {
		t.Fatalf("claude vendor = %q", got)
	}
	if got := ProviderIDFromVendorName(CustomAPIVendorName); got != "custom-api" {
		t.Fatalf("custom provider id = %q", got)
	}
	if !IsFixedProviderID("ollama") || IsFixedProviderID("unknown") {
		t.Fatalf("fixed provider detection mismatch")
	}
}

func TestProxyIngressURLAndParser(t *testing.T) {
	base := BuildProxyIngressBaseURL(27483, "claude-code")
	want := "http://127.0.0.1:27483/claude-code/v1"
	if base != want {
		t.Fatalf("base url = %q, want %q", base, want)
	}

	ingress, ok := ParseProxyIngressPath("/claude-code/v1/messages")
	if !ok {
		t.Fatalf("expected valid ingress")
	}
	if ingress.ProviderID != "claude-code" || ingress.ModelID != "" || ingress.APIStyle != "message" || ingress.PathSuffix != "/messages" {
		t.Fatalf("unexpected ingress: %+v", ingress)
	}

	legacy, ok := ParseProxyIngressPath("/claude-code/claude%20opus%2F4/claude/v1/messages")
	if !ok {
		t.Fatalf("expected valid legacy ingress")
	}
	if legacy.ProviderID != "claude-code" || legacy.ModelID != "claude opus/4" || legacy.APIStyle != "message" || legacy.PathSuffix != "/messages" {
		t.Fatalf("unexpected legacy ingress: %+v", legacy)
	}

	if _, ok := ParseProxyIngressPath("/claude-code/opus/messages"); ok {
		t.Fatalf("path without /v1 must not parse")
	}

	ingress2, ok := ParseProxyIngressPath("/codex/v1/v1/messages")
	if !ok {
		t.Fatalf("expected valid ingress for double /v1 path")
	}
	if ingress2.PathSuffix != "/messages" || ingress2.ProviderID != "codex" {
		t.Fatalf("unexpected ingress after dedupe: %+v", ingress2)
	}
}

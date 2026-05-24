package main

import (
	"testing"

	"github.com/clovapi/switcher/internal/profile"
)

func TestProxyHealthClientHost(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"127.0.0.1", "127.0.0.1"},
		{"0.0.0.0", "127.0.0.1"},
		{"::", "127.0.0.1"},
		{"", "127.0.0.1"},
	}
	for _, tc := range tests {
		if got := proxyHealthClientHost(tc.in); got != tc.want {
			t.Fatalf("proxyHealthClientHost(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestProxyBaseURLUsesLoopbackForWildcardBind(t *testing.T) {
	got := proxyBaseURL(profile.ProxyConfig{Host: "0.0.0.0", Port: 27483})
	want := "http://127.0.0.1:27483"
	if got != want {
		t.Fatalf("proxyBaseURL = %q, want %q", got, want)
	}
}

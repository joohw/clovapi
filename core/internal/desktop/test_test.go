package desktop

import (
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
)

type modelTestTransport func(*http.Request) (*http.Response, error)

func (f modelTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestProviderModelUsesConfiguredProxyAddress(t *testing.T) {
	for _, tc := range []struct {
		name         string
		host         string
		portOverride int
		wantBaseURL  string
	}{
		{"LAN IPv4", "192.168.42.251", 0, "http://192.168.42.251:27483"},
		{"IPv6", "2001:db8::1", 0, "http://[2001:db8::1]:27483"},
		{"IPv4 wildcard", "0.0.0.0", 0, "http://127.0.0.1:27483"},
		{"IPv6 wildcard", "::", 0, "http://127.0.0.1:27483"},
		{"port override", "192.168.42.251", 28888, "http://192.168.42.251:28888"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			config.SetDirOverride(t.TempDir())
			t.Cleanup(func() { config.SetDirOverride("") })
			if err := profile.SaveDesktop(&profile.Store{
				Proxy: profile.ProxyConfig{Enabled: true, Host: tc.host, Port: 27483},
				List: []profile.Profile{{
					Name: profile.CustomAPIProfileName, Kind: "api", ModelAdapter: "manual",
					Models: []profile.Model{{ID: "test-model", Model: "test-model",
						APIStyle: apistyle.OpenAIResponses, BaseURL: "https://example.invalid/v1"}},
				}},
			}); err != nil {
				t.Fatal(err)
			}

			var requests []string
			originalTransport := http.DefaultTransport
			t.Cleanup(func() { http.DefaultTransport = originalTransport })
			http.DefaultTransport = modelTestTransport(func(r *http.Request) (*http.Response, error) {
				requests = append(requests, r.Method+" "+r.URL.String())
				body := `{}`
				if r.URL.Path == "/health" {
					body = `{"ok":true,"service":"clovapi-core-proxy"}`
				}
				return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header),
					Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
			})

			result := TestProviderModel("custom", "test-model", tc.portOverride)
			if !result.OK || !result.Passed {
				t.Fatalf("TestProviderModel failed: %+v", result)
			}
			want := []string{
				"GET " + tc.wantBaseURL + "/health",
				"POST " + tc.wantBaseURL + "/custom/v1/responses",
				"POST " + tc.wantBaseURL + "/custom/v1/messages",
			}
			if !reflect.DeepEqual(requests, want) {
				t.Fatalf("proxy requests = %q, want %q", requests, want)
			}
		})
	}
}

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

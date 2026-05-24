package desktop

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	coreproxy "github.com/clovapi/switcher/internal/proxy"
	cfgpkg "github.com/clovapi/switcher/internal/config"
)

func TestTestBindingKimiCodexSubscriptionViaProxy(t *testing.T) {
	runKimiSubscriptionBindingTest(t, provider.CodexProviderID, provider.CodexVendorName, "gpt-5.4", "/codex/responses")
}

func TestTestBindingKimiClaudeSubscriptionViaProxy(t *testing.T) {
	runKimiSubscriptionBindingTest(t, provider.ClaudeCodeProviderID, provider.ClaudeCodeVendorName, "claude-sonnet-4-6", "/v1/messages")
}

func runKimiSubscriptionBindingTest(t *testing.T, providerID, vendorName, modelID, upstreamPath string) {
	t.Helper()

	var upstreamBody []byte
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != upstreamPath {
			t.Errorf("upstream path = %q want %q", r.URL.Path, upstreamPath)
		}
		var parsed map[string]any
		_ = json.Unmarshal(upstreamBody, &parsed)
		if parsed["stream"] != true {
			t.Errorf("upstream stream = %v want true", parsed["stream"])
			http.Error(w, `{"error":{"message":"Stream must be set to true"}}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		if upstreamPath == "/codex/responses" {
			_, _ = io.WriteString(w, "event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n")
			return
		}
		_, _ = io.WriteString(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
	}))
	t.Cleanup(up.Close)

	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   vendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: providerID,
			APIStyle:               subscriptionAPIStyle(providerID),
			BaseURL:                strings.TrimRight(up.URL, "/"),
			APIKey:                 "oauth-token",
			Model:                  modelID,
			Models: []profile.Model{{
				ID:       modelID,
				Model:    modelID,
				APIStyle: subscriptionAPIStyle(providerID),
				BaseURL:  strings.TrimRight(up.URL, "/"),
				APIKey:   "oauth-token",
			}},
		}},
	}

	core := coreproxy.NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	t.Cleanup(ts.Close)

	port := parseTestServerPort(t, ts.URL)
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	writeDesktopProfilesForTest(t, dir, port, vendorName, modelID, providerID)

	binding := fmt.Sprintf("@model:%s/%s", vendorName, modelID)
	result := TestBinding(binding, port, string(clikind.KimiCode))
	if !result.OK {
		t.Fatalf("result not ok: %+v", result)
	}
	if !result.Passed {
		t.Fatalf("binding probe failed: %+v upstream=%s", result, upstreamBody)
	}
	if !strings.Contains(string(upstreamBody), `"stream":true`) {
		t.Fatalf("upstream missing stream:true: %s", upstreamBody)
	}
}

func subscriptionAPIStyle(providerID string) apistyle.Style {
	switch providerID {
	case provider.CodexProviderID:
		return apistyle.OpenAIResponses
	default:
		return apistyle.Claude
	}
}

func parseTestServerPort(t *testing.T, rawURL string) int {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	var port int
	if _, err := fmt.Sscanf(u.Port(), "%d", &port); err != nil {
		t.Fatal(err)
	}
	return port
}

func writeDesktopProfilesForTest(t *testing.T, dir string, port int, vendorName, modelID, providerID string) {
	t.Helper()
	path := filepath.Join(dir, "profiles.json")
	style := string(subscriptionAPIStyle(providerID))
	payload := fmt.Sprintf(`{
  "version": 4,
  "proxy": {"enabled": true, "host": "127.0.0.1", "port": %d},
  "profiles": [
    {
      "name": %q,
      "kind": "subscription",
      "subscription_provider_id": %q,
      "model_adapter": "subscription",
      "models": [
        {"id": %q, "model": %q, "api_style": %q}
      ]
    }
  ]
}`, port, vendorName, providerID, modelID, modelID, style)
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatal(err)
	}
}

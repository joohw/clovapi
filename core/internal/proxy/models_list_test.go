package proxy

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestClaudeDesktopGatewayModelsListFormat(t *testing.T) {
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			Models: []profile.Model{
				{ID: "gpt-5.5", Model: "gpt-5.5"},
				{ID: "gpt-5.4", Model: "gpt-5.4"},
			},
		}},
	}
	s := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/codex/v1/models", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer clovapi-local")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["has_more"] != false {
		t.Fatalf("has_more = %#v", body["has_more"])
	}
	if body["first_id"] != "gpt-5.5" || body["last_id"] != "gpt-5.4" {
		t.Fatalf("first/last id = %#v / %#v", body["first_id"], body["last_id"])
	}
	data, ok := body["data"].([]any)
	if !ok || len(data) != 2 {
		t.Fatalf("data = %#v", body["data"])
	}
	item, _ := data[0].(map[string]any)
	if item["type"] != "model" || item["id"] != "gpt-5.5" {
		t.Fatalf("item = %#v", item)
	}
}

func TestCodexModelsListWithoutDesktopBearerStaysOpenAIFormat(t *testing.T) {
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name: provider.CodexVendorName,
			Kind: "subscription",
			Models: []profile.Model{
				{ID: "gpt-5.5", Model: "gpt-5.5"},
			},
		}},
	}
	s := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/codex/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["object"] != "list" {
		t.Fatalf("object = %#v", body["object"])
	}
	if _, ok := body["has_more"]; ok {
		t.Fatalf("unexpected Claude Desktop fields: %#v", body)
	}
}

func TestIsClaudeDesktopGatewayRequest(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://127.0.0.1:27483/codex/v1/models", nil)
	req.Header.Set("Authorization", "Bearer clovapi-local")
	if !isClaudeDesktopGatewayRequest(req) {
		t.Fatal("expected desktop gateway request")
	}
	req.Header.Set("Authorization", "Bearer sk-other")
	if isClaudeDesktopGatewayRequest(req) {
		t.Fatal("unexpected desktop gateway match")
	}
}

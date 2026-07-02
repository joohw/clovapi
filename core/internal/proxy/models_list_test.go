package proxy

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestModelsListUsesOpenAIListFormat(t *testing.T) {
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
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/codex/v1/models")
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
	if body["object"] != "list" {
		t.Fatalf("object = %#v", body["object"])
	}
	data, ok := body["data"].([]any)
	if !ok || len(data) != 2 {
		t.Fatalf("data = %#v", body["data"])
	}
	item, _ := data[0].(map[string]any)
	if item["id"] != "gpt-5.5" || item["object"] != "model" {
		t.Fatalf("item = %#v", item)
	}
}

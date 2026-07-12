package desktop

import (
	"testing"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/syslog"
)

func TestParseSaveInputIgnoresLegacyActive(t *testing.T) {
	raw := []byte(`{
		"profiles": [],
		"active": {
			"codex": {"provider_id": "codex", "model_id": "gpt-5.4"}
		}
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(input.Profiles) != 0 {
		t.Fatalf("unexpected profiles: %+v", input.Profiles)
	}
}

func TestParseSaveInputPreservesProfiles(t *testing.T) {
	raw := []byte(`{
		"profiles": [{"name": "Custom API", "kind": "api", "modelAdapter": "manual", "models": []}]
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(input.Profiles) != 1 || input.Profiles[0].Name != "Custom API" {
		t.Fatalf("unexpected profiles: %+v", input.Profiles)
	}
}

func TestParseSaveInputPreservesSubscriptionRoutingFields(t *testing.T) {
	raw := []byte(`{
		"profiles": [],
		"subscriptionAccounts": [{
			"id": "codex-personal",
			"providerId": "codex",
			"label": "Codex 1",
			"credentialRef": "subscription/codex-personal.json",
			"status": "active",
			"models": [{"id": "gpt-5.5", "label": "GPT-5.5", "model": "gpt-5.5", "apiStyle": "responses"}]
		}],
		"routeBackends": [{
			"id": "subscription__codex-personal__codex__gpt-5.5",
			"sourceType": "subscription",
			"sourceId": "codex-personal",
			"providerId": "codex",
			"modelId": "gpt-5.5",
			"upstreamModel": "gpt-5.5",
			"apiStyle": "responses",
			"enabled": true,
			"priority": 1,
			"weight": 1
		}]
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(input.SubscriptionAccounts) != 1 || input.SubscriptionAccounts[0].ID != "codex-personal" {
		t.Fatalf("unexpected subscription accounts: %+v", input.SubscriptionAccounts)
	}
	if len(input.RouteBackends) != 1 || input.RouteBackends[0].SourceID != "codex-personal" {
		t.Fatalf("unexpected route backends: %+v", input.RouteBackends)
	}
}

func TestSaveProfilesSkipsUnchangedNormalizedStore(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })

	first := SaveProfiles(SaveInput{Profiles: []UIVendor{{
		Name:         "Custom API",
		Kind:         "api",
		ModelAdapter: "manual",
		Models:       []UIModel{},
	}}})
	if !first.OK {
		t.Fatalf("first save failed: %s", first.Error)
	}
	before, err := syslog.List(0)
	if err != nil {
		t.Fatal(err)
	}

	proxyConfig := first.Proxy
	second := SaveProfiles(SaveInput{
		Profiles:             first.Profiles,
		Proxy:                &proxyConfig,
		SubscriptionAccounts: first.SubscriptionAccounts,
		RouteBackends:        first.RouteBackends,
	})
	if !second.OK {
		t.Fatalf("second save failed: %s", second.Error)
	}
	after, err := syslog.List(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != len(before) {
		t.Fatalf("unchanged save added system logs: before=%d after=%d", len(before), len(after))
	}
}

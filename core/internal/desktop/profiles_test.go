package desktop

import (
	"testing"

	"github.com/clovapi/switcher/internal/profile"
)

func TestParseSaveInputStructuredActive(t *testing.T) {
	raw := []byte(`{
		"profiles": [],
		"active": {
			"kimi-code": {"provider_id": "codex", "model_id": "gpt-5.4"}
		}
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	got := input.Active["kimi-code"]
	if got.ProviderID != "codex" || got.ModelID != "gpt-5.4" {
		t.Fatalf("unexpected active: %+v", got)
	}
}

func TestParseSaveInputLegacyBindingString(t *testing.T) {
	raw := []byte(`{
		"profiles": [],
		"active": {
			"codex": "codex/gpt-5.4"
		}
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	got := input.Active["codex"]
	if got.ProviderID != "codex" || got.ModelID != "gpt-5.4" {
		t.Fatalf("unexpected active: %+v", got)
	}
}

func TestParseSaveInputRejectsInvalidActiveValue(t *testing.T) {
	raw := []byte(`{
		"profiles": [],
		"active": {
			"codex": {"unexpected": true}
		}
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(input.Active) != 0 {
		t.Fatalf("expected invalid active entry to be skipped, got %+v", input.Active)
	}
}

func TestParseSaveInputPreservesProfiles(t *testing.T) {
	raw := []byte(`{
		"profiles": [{"name": "Custom API", "kind": "api", "modelAdapter": "manual", "models": []}],
		"active": {}
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(input.Profiles) != 1 || input.Profiles[0].Name != "Custom API" {
		t.Fatalf("unexpected profiles: %+v", input.Profiles)
	}
}

func TestParseSaveInputCamelCaseActive(t *testing.T) {
	raw := []byte(`{
		"profiles": [],
		"active": {
			"claude-code": {"providerId": "claude-code", "modelId": "claude-sonnet-4-6"}
		}
	}`)
	input, err := ParseSaveInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	// JSON tags are snake_case; camelCase fields are ignored unless we add support.
	// Desktop UI always sends snake_case via activeSelection().
	got := input.Active["claude-code"]
	if got.ProviderID != "" || got.ModelID != "" {
		t.Fatalf("camelCase without snake_case tags should not populate: %+v", got)
	}
	_ = profile.ActiveSelection{}
}

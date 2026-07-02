package desktop

import "testing"

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

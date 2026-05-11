package apply

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/pelletier/go-toml/v2"
)

func TestResetDefaultCodex(t *testing.T) {
	_ = testHome(t)
	path, err := CodexConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	p := profile.Profile{
		Name: "x", CLI: clikind.Codex, APIStyle: apistyle.OpenAIResponses,
		BaseURL: "https://gw/v1", APIKey: "k", Model: "m1",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	if err := ResetDefault(clikind.Codex); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := toml.Unmarshal(data, &root); err != nil {
		t.Fatal(err)
	}
	if _, ok := root["model_providers"]; ok {
		t.Fatalf("expected model_providers cleared, got %#v", root)
	}
	if _, ok := root["model_provider"]; ok {
		t.Fatal("model_provider should be gone")
	}
}

func TestResetDefaultClaudeCode(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "x", CLI: clikind.ClaudeCode, APIStyle: apistyle.Claude,
		BaseURL: "https://gw", APIKey: "sk", Model: "opus",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	if err := ResetDefault(clikind.ClaudeCode); err != nil {
		t.Fatal(err)
	}
	path, err := ClaudeSettingsPath()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		t.Fatal(err)
	}
	if _, ok := root["env"]; ok {
		t.Fatalf("expected env cleared, got %v", root)
	}
	if _, ok := root["model"]; ok {
		t.Fatal("model should be removed")
	}
}

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

func testHome(t *testing.T) string {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)
	oc := filepath.Join(h, ".config", "opencode")
	if err := os.MkdirAll(oc, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv(envOpenCodeDirOverride, oc)
	return h
}

func TestApplyClaudeCodeRemovesStaleAPIKey(t *testing.T) {
	_ = testHome(t)
	path, err := ClaudeSettingsPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	stale := []byte(`{"env":{"ANTHROPIC_API_KEY":"old","ANTHROPIC_AUTH_TOKEN":"old2"}}`)
	if err := os.WriteFile(path, stale, 0o600); err != nil {
		t.Fatal(err)
	}
	p := profile.Profile{
		Name: "z", CLI: clikind.ClaudeCode, APIStyle: apistyle.Claude,
		BaseURL: "https://gw", APIKey: "new-secret",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var root map[string]any
	_ = json.Unmarshal(data, &root)
	env := root["env"].(map[string]any)
	if _, ok := env["ANTHROPIC_API_KEY"]; ok {
		t.Fatal("expected ANTHROPIC_API_KEY removed")
	}
	if env["ANTHROPIC_AUTH_TOKEN"] != "new-secret" {
		t.Fatal(env["ANTHROPIC_AUTH_TOKEN"])
	}
}

func TestApplyClaudeCode(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name:     "x",
		CLI:      clikind.ClaudeCode,
		APIStyle: apistyle.Claude,
		BaseURL:  "https://api.example",
		APIKey:   "sk-1",
	}
	if err := Apply(p); err != nil {
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
	env := root["env"].(map[string]any)
	if env["ANTHROPIC_AUTH_TOKEN"] != "sk-1" || env["ANTHROPIC_BASE_URL"] != "https://api.example" {
		t.Fatalf("%v", env)
	}
	if _, hasAPIKey := env["ANTHROPIC_API_KEY"]; hasAPIKey {
		t.Fatal("ANTHROPIC_API_KEY must be omitted to avoid Claude Code auth conflict", env["ANTHROPIC_API_KEY"])
	}
	if _, ok := env["ANTHROPIC_MODEL"]; ok {
		t.Fatal("unexpected model without profile.Model")
	}

	p2 := profile.Profile{
		Name:     "y",
		CLI:      clikind.ClaudeCode,
		APIStyle: apistyle.Claude,
		BaseURL:  "https://api.example",
		APIKey:   "sk-1",
		Model:    "deepseek-v4-flash",
	}
	if err := Apply(p2); err != nil {
		t.Fatal(err)
	}
	data2, _ := os.ReadFile(path)
	_ = json.Unmarshal(data2, &root)
	env = root["env"].(map[string]any)
	if env["ANTHROPIC_MODEL"] != "deepseek-v4-flash" {
		t.Fatalf("%v", env["ANTHROPIC_MODEL"])
	}
	if root["model"] != "deepseek-v4-flash" {
		t.Fatalf("top-level model: %v", root["model"])
	}
}

func TestApplyCodex(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name:     "x",
		CLI:      clikind.Codex,
		APIStyle: apistyle.OpenAIResponses,
		BaseURL:  "https://gw/v1",
		APIKey:   "tok",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	path, err := CodexConfigPath()
	if err != nil {
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
	if root["model_provider"] != CodexProviderID {
		t.Fatalf("%v", root["model_provider"])
	}
	mp := root["model_providers"].(map[string]any)
	block := mp[CodexProviderID].(map[string]any)
	if block["base_url"] != "https://gw/v1" || block["experimental_bearer_token"] != "tok" {
		t.Fatalf("%v", block)
	}
	if _, ok := root["model"]; ok {
		t.Fatal("top-level model should be absent when profile.Model is empty")
	}

	p2 := profile.Profile{
		Name: "y", CLI: clikind.Codex, APIStyle: apistyle.OpenAIResponses,
		BaseURL: "https://api.deepseek.com/v1", APIKey: "tok", Model: "deepseek-v4-pro",
	}
	if err := Apply(p2); err != nil {
		t.Fatal(err)
	}
	data2, _ := os.ReadFile(path)
	var root2 map[string]any
	_ = toml.Unmarshal(data2, &root2)
	if root2["model"] != "deepseek-v4-pro" {
		t.Fatalf("model: %v", root2["model"])
	}

	p3 := profile.Profile{
		Name: "proxy", CLI: clikind.Codex, APIStyle: apistyle.OpenAIResponses,
		BaseURL: "http://127.0.0.1:27483/codex/gpt-5.4/openai-responses",
		APIKey:  "clovapi-local", Model: "gpt-5.4",
	}
	if err := Apply(p3); err != nil {
		t.Fatal(err)
	}
	data3, _ := os.ReadFile(path)
	var root3 map[string]any
	_ = toml.Unmarshal(data3, &root3)
	block3 := root3["model_providers"].(map[string]any)[CodexProviderID].(map[string]any)
	wantProxy := "http://127.0.0.1:27483/codex/gpt-5.4/openai-responses/v1"
	if block3["base_url"] != wantProxy {
		t.Fatalf("proxy base_url = %v want %v", block3["base_url"], wantProxy)
	}
}

func TestApplyOpenCode(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name:     "x",
		CLI:      clikind.OpenCode,
		APIStyle: apistyle.OpenAIChat,
		BaseURL:  "https://gw",
		APIKey:   "k2",
		Model:    "gpt-4o-mini",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	path, err := OpenCodeConfigPath()
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
	prov := root["provider"].(map[string]any)
	cv := prov["clovapi"].(map[string]any)
	if cv["npm"] != "@ai-sdk/openai-compatible" {
		t.Fatalf("npm: %v", cv["npm"])
	}
	opts := cv["options"].(map[string]any)
	if opts["baseURL"] != "https://gw/v1" || opts["apiKey"] != "k2" {
		t.Fatalf("%v", opts)
	}
	if root["model"] != "clovapi/gpt-4o-mini" {
		t.Fatalf("top-level model: %v", root["model"])
	}
}

func TestApplyRegistry(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{Name: "z", CLI: clikind.ClaudeCode, APIStyle: apistyle.Claude, BaseURL: "u", APIKey: "k", Model: "m"}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
}

func TestApplyKimiWritesMaxContextSize(t *testing.T) {
	_ = testHome(t)
	path, err := KimiConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	p := profile.Profile{
		Name: "sub", CLI: clikind.KimiCode, APIStyle: apistyle.Claude,
		BaseURL: "https://api.anthropic.com", APIKey: "sk-ant-test", Model: "claude-sonnet-4-20250514",
	}
	if err := Apply(p); err != nil {
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
	models, _ := root["models"].(map[string]any)
	ent, _ := models["claude-sonnet-4-20250514"].(map[string]any)
	if ent == nil {
		t.Fatalf("models entry missing: %#v", models)
	}
	switch v := ent["max_context_size"].(type) {
	case int:
		if v <= 0 {
			t.Fatalf("max_context_size: %d", v)
		}
	case int64:
		if v <= 0 {
			t.Fatalf("max_context_size: %d", v)
		}
	default:
		t.Fatalf("max_context_size type: %T %v", ent["max_context_size"], ent["max_context_size"])
	}
}

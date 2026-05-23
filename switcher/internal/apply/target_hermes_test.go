package apply

import (
	"os"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"gopkg.in/yaml.v3"
)

func TestApplyHermesCodexSubscriptionProxyUsesResponsesIngress(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.OpenAIResponses,
		BaseURL: "http://127.0.0.1:27483/codex/gpt-5.4/openai-responses", APIKey: "clovapi-local", Model: "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	modelObj, _ := root["model"].(map[string]any)
	want := "http://127.0.0.1:27483/codex/gpt-5.4/openai-responses/v1"
	if modelObj["base_url"] != want {
		t.Fatalf("base_url = %q want %q", modelObj["base_url"], want)
	}
	if modelObj["api_mode"] != "codex_responses" {
		t.Fatalf("api_mode = %v want codex_responses", modelObj["api_mode"])
	}
}

func TestApplyHermesRelayWritesCustomProviders(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.OpenAIChat,
		BaseURL: "http://127.0.0.1:27483/codex/gpt-5.4/openai-chat", APIKey: "clovapi-local", Model: "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj == nil {
		t.Fatal("missing model block")
	}
	if modelObj["provider"] != "custom" {
		t.Fatalf("provider = %v", modelObj["provider"])
	}
	want := "http://127.0.0.1:27483/codex/gpt-5.4/openai-chat/v1"
	if modelObj["base_url"] != want {
		t.Fatalf("base_url = %q want %q", modelObj["base_url"], want)
	}
	if modelObj["default"] != "gpt-5.4" {
		t.Fatalf("default = %v want bare model id", modelObj["default"])
	}
	if modelObj["api_mode"] != "chat_completions" {
		t.Fatalf("api_mode = %v", modelObj["api_mode"])
	}
	providers, _ := root["custom_providers"].([]any)
	if len(providers) != 1 {
		t.Fatalf("custom_providers len = %d", len(providers))
	}
	ent, _ := providers[0].(map[string]any)
	if ent["name"] != "clovapi" || ent["base_url"] != want || ent["model"] != "gpt-5.4" {
		t.Fatalf("custom_providers entry = %#v", ent)
	}
}

func TestApplyHermesCodexSubscriptionUsesNativeProvider(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "sub", CLI: clikind.Hermes, APIStyle: apistyle.OpenAIResponses,
		Kind: "subscription", SubscriptionProviderID: provider.CodexProviderID,
		BaseURL: "https://chatgpt.com/backend-api", APIKey: "oauth-token", Model: "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj["provider"] != "openai-codex" {
		t.Fatalf("provider = %v", modelObj["provider"])
	}
	if _, ok := modelObj["base_url"]; ok {
		t.Fatalf("base_url must be omitted for native codex provider: %v", modelObj["base_url"])
	}
	if _, ok := modelObj["default"]; ok {
		t.Fatalf("default must be omitted for native subscription; Hermes uses first catalog model")
	}
}

func TestApplyHermesClaudeProxyUsesCustomProvider(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.Claude,
		BaseURL: "http://127.0.0.1:27483/claude-code/claude-opus-4-7/claude", APIKey: "clovapi-local", Model: "claude-opus-4-7",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj["provider"] != "custom" {
		t.Fatalf("provider = %v want custom for local proxy", modelObj["provider"])
	}
	if modelObj["api_mode"] != "anthropic_messages" {
		t.Fatalf("api_mode = %v want anthropic_messages", modelObj["api_mode"])
	}
	want := "http://127.0.0.1:27483/claude-code/claude-opus-4-7/claude/v1"
	if modelObj["base_url"] != want {
		t.Fatalf("base_url = %q want %q", modelObj["base_url"], want)
	}
}

func TestApplyHermesClaudeSubscriptionUsesNativeProvider(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "sub", CLI: clikind.Hermes, APIStyle: apistyle.Claude,
		Kind: "subscription", SubscriptionProviderID: provider.ClaudeCodeProviderID,
		BaseURL: "https://api.anthropic.com", APIKey: "oauth-token", Model: "claude-opus-4-6",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj["provider"] != "anthropic" {
		t.Fatalf("provider = %v", modelObj["provider"])
	}
	if _, ok := modelObj["default"]; ok {
		t.Fatalf("default must be omitted for native subscription; Hermes uses first catalog model")
	}
}

func TestApplyHermesUsesFirstVendorModelNotBoundModel(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.Claude,
		BaseURL: "http://127.0.0.1:27483/claude-code/claude-opus-4-7/claude",
		APIKey:  "clovapi-local",
		Model:   "claude-sonnet-4-6",
		Models: []profile.Model{
			{ID: "claude-opus-4-7", Model: "claude-opus-4-7", APIStyle: apistyle.Claude},
			{ID: "claude-sonnet-4-6", Model: "claude-sonnet-4-6", APIStyle: apistyle.Claude},
		},
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj["default"] != "claude-opus-4-7" {
		t.Fatalf("default = %v want first vendor model claude-opus-4-7", modelObj["default"])
	}
	providers, _ := root["custom_providers"].([]any)
	ent, _ := providers[0].(map[string]any)
	if ent["model"] != "claude-opus-4-7" {
		t.Fatalf("custom provider model = %v", ent["model"])
	}
	models, _ := ent["models"].(map[string]any)
	if models["claude-opus-4-7"] == nil || models["claude-sonnet-4-6"] == nil {
		t.Fatalf("custom provider models = %#v", models)
	}
}

func TestHermesResetDefaultClearsCustomProviders(t *testing.T) {
	_ = testHome(t)
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.OpenAIChat,
		BaseURL: "http://127.0.0.1:27483/codex/gpt-5.4/openai-chat", APIKey: "clovapi-local", Model: "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	if err := ResetDefault(clikind.Hermes); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfigRoot(t)
	if _, ok := root["custom_providers"]; ok {
		t.Fatal("custom_providers should be removed on reset")
	}
	modelObj, _ := root["model"].(map[string]any)
	if modelObj != nil {
		if _, ok := modelObj["default"]; ok {
			t.Fatal("model.default should be cleared")
		}
	}
}

func readHermesConfigRoot(t *testing.T) map[string]any {
	t.Helper()
	path, err := HermesConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	root := map[string]any{}
	if err := yaml.Unmarshal(data, &root); err != nil {
		t.Fatal(err)
	}
	return root
}

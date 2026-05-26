package apply

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"gopkg.in/yaml.v3"
)

func testHermesHome(t *testing.T) string {
	t.Helper()
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)
	return h
}

func readHermesConfig(t *testing.T) map[string]any {
	t.Helper()
	path, err := HermesConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := yaml.Unmarshal(data, &root); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestHermesApplyCodexProxyPinsModelDefault(t *testing.T) {
	_ = testHermesHome(t)
	proxyBase := provider.BuildProxyIngressBaseURL(27483, provider.CodexProviderID, "gpt-5.4", "openai-responses")
	p := profile.Profile{
		Name:                   "@model:Codex Subscription/gpt-5.4",
		CLI:                    agentkind.Hermes,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		BaseURL:                proxyBase,
		APIKey:                 "clovapi-local",
		Model:                  "gpt-5.4",
		Models: []profile.Model{
			{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses},
			{ID: "gpt-5.5", Model: "gpt-5.5", APIStyle: apistyle.OpenAIResponses},
		},
		APIStyle: apistyle.OpenAIResponses,
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}

	root := readHermesConfig(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj == nil {
		t.Fatalf("missing model section: %#v", root)
	}
	if modelObj["provider"] != "clovapi" {
		t.Fatalf("provider = %v want clovapi", modelObj["provider"])
	}
	if modelObj["default"] != "gpt-5.4" {
		t.Fatalf("default = %v want gpt-5.4", modelObj["default"])
	}
	baseURL := strings.TrimSpace(fmt.Sprint(modelObj["base_url"]))
	if !strings.Contains(baseURL, "/codex/gpt-5.4/openai-responses") {
		t.Fatalf("base_url = %q", baseURL)
	}
	if modelObj["api_mode"] != "codex_responses" {
		t.Fatalf("api_mode = %v want codex_responses", modelObj["api_mode"])
	}

	list, _ := root["custom_providers"].([]any)
	if len(list) != 1 {
		t.Fatalf("custom_providers len = %d want 1", len(list))
	}
	ent, _ := list[0].(map[string]any)
	if ent["model"] != "gpt-5.4" {
		t.Fatalf("custom provider model = %v", ent["model"])
	}
	models, _ := ent["models"].(map[string]any)
	if len(models) != 1 {
		t.Fatalf("custom provider models = %#v want only gpt-5.4", models)
	}
	if _, ok := models["gpt-5.4"]; !ok {
		t.Fatalf("custom provider models = %#v", models)
	}
}

func TestHermesApplyDirectCodexSubscriptionUsesCustomWithDefault(t *testing.T) {
	_ = testHermesHome(t)
	p := profile.Profile{
		Name:                   "@model:Codex Subscription/gpt-5.4",
		CLI:                    agentkind.Hermes,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		BaseURL:                "https://chatgpt.com/backend-api",
		APIKey:                 "oauth-token",
		Model:                  "gpt-5.4",
		APIStyle:               apistyle.OpenAIResponses,
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	root := readHermesConfig(t)
	modelObj, _ := root["model"].(map[string]any)
	if modelObj["provider"] == "openai-codex" {
		t.Fatalf("must not write native openai-codex without model.default: %#v", modelObj)
	}
	if modelObj["default"] != "gpt-5.4" {
		t.Fatalf("default = %v want gpt-5.4", modelObj["default"])
	}
	if modelObj["provider"] != "clovapi" {
		t.Fatalf("provider = %v want clovapi", modelObj["provider"])
	}
	if modelObj["api_mode"] != "codex_responses" {
		t.Fatalf("api_mode = %v want codex_responses", modelObj["api_mode"])
	}
}

func TestHermesPathModelIDFromProxyIngress(t *testing.T) {
	base := provider.BuildProxyIngressBaseURL(27483, provider.CodexProviderID, "gpt-5.4", "claude")
	if got := hermesPathModelID(base); got != "gpt-5.4" {
		t.Fatalf("hermesPathModelID(%q) = %q want gpt-5.4", base, got)
	}
	if got := hermesPathModelID("https://example.com/v1"); got != "" {
		t.Fatalf("unexpected model id %q", got)
	}
}

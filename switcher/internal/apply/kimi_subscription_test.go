package apply

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/pelletier/go-toml/v2"
)

func TestApplyKimiClaudeSubscriptionIngress(t *testing.T) {
	_ = testHome(t)
	wantBase := provider.BuildProxyIngressBaseURL(27483, provider.ClaudeCodeProviderID, "claude-sonnet-4-6", "claude")
	p := profile.Profile{
		Name:     "@model:Claude Subscription/claude-sonnet-4-6",
		CLI:      clikind.KimiCode,
		APIStyle: apistyle.Claude,
		BaseURL:  wantBase,
		APIKey:   "clovapi-local",
		Model:    "claude-sonnet-4-6",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	assertKimiProviderConfig(t, wantBase, "anthropic", "claude-sonnet-4-6")
}

func TestApplyKimiCodexSubscriptionIngress(t *testing.T) {
	_ = testHome(t)
	wantBase := provider.BuildProxyIngressBaseURL(27483, provider.CodexProviderID, "gpt-5.4", "claude")
	p := profile.Profile{
		Name:     "@model:Codex Subscription/gpt-5.4",
		CLI:      clikind.KimiCode,
		APIStyle: apistyle.Claude,
		BaseURL:  wantBase,
		APIKey:   "clovapi-local",
		Model:    "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}
	assertKimiProviderConfig(t, wantBase, "anthropic", "gpt-5.4")
}

func assertKimiProviderConfig(t *testing.T, wantBase, wantType, wantModel string) {
	t.Helper()
	path, err := KimiConfigPath()
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
	if got, _ := root["default_model"].(string); got != wantModel {
		t.Fatalf("default_model = %q want %q", got, wantModel)
	}
	provs, _ := root["providers"].(map[string]any)
	clov, _ := provs["clovapi"].(map[string]any)
	if clov == nil {
		t.Fatalf("providers.clovapi missing: %#v", root)
	}
	if got, _ := clov["type"].(string); got != wantType {
		t.Fatalf("provider type = %q want %q", got, wantType)
	}
	if got, _ := clov["base_url"].(string); got != wantBase {
		t.Fatalf("base_url = %q want %q", got, wantBase)
	}
	if got, _ := clov["api_key"].(string); got != "clovapi-local" {
		t.Fatalf("api_key = %q", got)
	}
	models, _ := root["models"].(map[string]any)
	ent, _ := models[wantModel].(map[string]any)
	if ent == nil {
		t.Fatalf("models[%q] missing", wantModel)
	}
	if got, _ := ent["model"].(string); got != wantModel {
		t.Fatalf("model wire = %q want %q", got, wantModel)
	}
	if !strings.Contains(filepath.Base(path), "config.toml") {
		t.Fatalf("unexpected config path %q", path)
	}
}

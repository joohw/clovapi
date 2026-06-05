package apply

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/ingresstoken"
	"github.com/clovapi/switcher/internal/profile"
)

func TestClaudeDesktopApplyWritesThreePProfile(t *testing.T) {
	root := t.TempDir()
	t.Setenv(envClaudeDesktopDir, root)
	paths, err := ClaudeDesktopPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(paths.normalConfigPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(paths.normalConfigPath, []byte(`{"existing":true}`), 0o600); err != nil {
		t.Fatal(err)
	}

	p := profile.Profile{
		CLI:      agentkind.ClaudeDesktop,
		APIStyle: apistyle.Claude,
		BaseURL:  "http://127.0.0.1:27483/custom-api/v1",
		APIKey:   ingresstoken.ForAgent(agentkind.ClaudeDesktop),
		Model:    "gpt-5.5/pro",
	}
	if err := (claudeDesktopTarget{}).Apply(p); err != nil {
		t.Fatal(err)
	}

	normal := readJSONMap(t, paths.normalConfigPath)
	threep := readJSONMap(t, paths.threepConfigPath)
	prof := readJSONMap(t, paths.profilePath)
	meta := readJSONMap(t, paths.metaPath)

	if normal["deploymentMode"] != "3p" || normal["existing"] != true {
		t.Fatalf("normal config = %#v", normal)
	}
	if threep["deploymentMode"] != "3p" {
		t.Fatalf("3p config = %#v", threep)
	}
	wantBase := "http://127.0.0.1:27483/custom-api"
	if prof["inferenceGatewayBaseUrl"] != wantBase {
		t.Fatalf("base url = %q want %q", prof["inferenceGatewayBaseUrl"], wantBase)
	}
	if prof["inferenceGatewayApiKey"] != "clovapi--claude-desktop" || prof["inferenceGatewayAuthScheme"] != "bearer" || prof["inferenceProvider"] != "gateway" {
		t.Fatalf("profile auth/provider fields = %#v", prof)
	}
	models, ok := prof["inferenceModels"].([]any)
	if !ok || len(models) != 1 {
		t.Fatalf("inferenceModels = %#v", prof["inferenceModels"])
	}
	model, _ := models[0].(map[string]any)
	if model["name"] != "claude-sonnet-4-6" {
		t.Fatalf("model route = %#v want claude-sonnet-4-6 alias for gpt-5.5/pro", model)
	}
	if meta["appliedId"] != claudeDesktopProfileID {
		t.Fatalf("meta = %#v", meta)
	}
}

func TestClaudeDesktopResetRestoresOfficialMode(t *testing.T) {
	root := t.TempDir()
	t.Setenv(envClaudeDesktopDir, root)
	p := profile.Profile{
		CLI:      agentkind.ClaudeDesktop,
		APIStyle: apistyle.Claude,
		BaseURL:  "http://127.0.0.1:27483/custom-api/v1",
		APIKey:   ingresstoken.ForAgent(agentkind.ClaudeDesktop),
		Model:    "gpt-5.5",
	}
	if err := (claudeDesktopTarget{}).Apply(p); err != nil {
		t.Fatal(err)
	}
	paths, err := ClaudeDesktopPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := (claudeDesktopTarget{}).ResetDefault(); err != nil {
		t.Fatal(err)
	}
	normal := readJSONMap(t, paths.normalConfigPath)
	threep := readJSONMap(t, paths.threepConfigPath)
	meta := readJSONMap(t, paths.metaPath)
	if normal["deploymentMode"] != "1p" || threep["deploymentMode"] != "1p" {
		t.Fatalf("deployment modes normal=%#v threep=%#v", normal, threep)
	}
	if _, err := os.Stat(paths.profilePath); !os.IsNotExist(err) {
		t.Fatalf("profile should be removed, stat err=%v", err)
	}
	if _, ok := meta["appliedId"]; ok {
		t.Fatalf("appliedId should be cleared: %#v", meta)
	}
}

func TestClaudeDesktopDirectProfileKeepsAnthropicModel(t *testing.T) {
	prof := claudeDesktopGatewayProfile(
		ensureAnthropicWireBaseURL("https://api.anthropic.com/v1"),
		"sk-test",
		"claude-opus-4-8",
	)
	if prof["inferenceGatewayBaseUrl"] != "https://api.anthropic.com" {
		t.Fatalf("base url = %q", prof["inferenceGatewayBaseUrl"])
	}
	models := prof["inferenceModels"].([]any)
	model := models[0].(map[string]any)
	if model["name"] != "claude-opus-4-8" {
		t.Fatalf("model = %#v", model)
	}
}

func readJSONMap(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

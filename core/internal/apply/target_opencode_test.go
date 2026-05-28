package apply

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
)

func TestOpenCodeApplyAndResetPreserveStockProviderSettings(t *testing.T) {
	tests := []struct {
		name       string
		style      apistyle.Style
		stockID    string
		stockBase  string
		stockKey   string
		wantNPM    string
		wantBase   string
		profileURL string
	}{
		{
			name:       "claude preserves anthropic",
			style:      apistyle.Claude,
			stockID:    "anthropic",
			stockBase:  "https://api.anthropic.example/v1",
			stockKey:   "user-anthropic-key",
			wantNPM:    "@ai-sdk/anthropic",
			wantBase:   "http://127.0.0.1:8080/proxy/claude/v1",
			profileURL: "http://127.0.0.1:8080/proxy/claude/v1",
		},
		{
			name:       "gemini preserves gemini",
			style:      apistyle.Gemini,
			stockID:    "gemini",
			stockBase:  "https://generativelanguage.googleapis.com/v1beta",
			stockKey:   "user-gemini-key",
			wantNPM:    "@ai-sdk/google",
			wantBase:   "http://127.0.0.1:8080/proxy/gemini/v1",
			profileURL: "http://127.0.0.1:8080/proxy/gemini",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			t.Setenv("HOME", dir)
			t.Setenv(envOpenCodeDirOverride, filepath.Join(dir, ".config", "opencode"))

			configDir := filepath.Join(dir, ".config", "opencode")
			if err := os.MkdirAll(configDir, 0o700); err != nil {
				t.Fatal(err)
			}
			configPath := filepath.Join(configDir, "opencode.json")
			writeOpenCodeTestConfig(t, configPath, map[string]any{
				"provider": map[string]any{
					tt.stockID: map[string]any{
						"options": map[string]any{
							"baseURL": tt.stockBase,
							"apiKey":  tt.stockKey,
						},
					},
				},
			})

			p := profile.Profile{
				CLI:      agentkind.OpenCode,
				APIStyle: tt.style,
				BaseURL:  tt.profileURL,
				APIKey:   "clovapi-key",
				Model:    "test-model",
			}
			if err := (openCodeTarget{}).Apply(p); err != nil {
				t.Fatal(err)
			}

			applied := readOpenCodeTestConfig(t, configPath)
			assertOpenCodeStockProvider(t, applied, tt.stockID, tt.stockBase, tt.stockKey)
			clovapi := providerEntry(t, applied, opencodeRelayID)
			if clovapi["npm"] != tt.wantNPM {
				t.Fatalf("clovapi npm: %v", clovapi["npm"])
			}
			opts := mapEntry(t, clovapi, "options")
			if opts["baseURL"] != tt.wantBase {
				t.Fatalf("clovapi baseURL: %v", opts["baseURL"])
			}
			if opts["apiKey"] != "clovapi-key" {
				t.Fatalf("clovapi apiKey: %v", opts["apiKey"])
			}
			if applied["model"] != opencodeRelayID+"/test-model" {
				t.Fatalf("model after apply: %v", applied["model"])
			}

			if err := (openCodeTarget{}).ResetDefault(); err != nil {
				t.Fatal(err)
			}

			reset := readOpenCodeTestConfig(t, configPath)
			assertOpenCodeStockProvider(t, reset, tt.stockID, tt.stockBase, tt.stockKey)
			providers := mapEntry(t, reset, "provider")
			if _, ok := providers[opencodeRelayID]; ok {
				t.Fatalf("clovapi provider still present after reset: %#v", providers[opencodeRelayID])
			}
			if _, ok := reset["model"]; ok {
				t.Fatalf("model still present after reset: %v", reset["model"])
			}
		})
	}
}

func TestOpenCodeApplyDoesNotPromoteLowerPrecedenceConfig(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv(envOpenCodeDirOverride, filepath.Join(dir, ".config", "opencode"))

	configDir := filepath.Join(dir, ".config", "opencode")
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		t.Fatal(err)
	}
	legacyPath := filepath.Join(configDir, "config.json")
	writablePath := filepath.Join(configDir, "opencode.jsonc")
	writeOpenCodeTestConfig(t, legacyPath, map[string]any{
		"provider": map[string]any{
			"anthropic": map[string]any{
				"options": map[string]any{
					"baseURL": "https://api.anthropic.example/v1",
					"apiKey":  "user-anthropic-key",
				},
			},
		},
	})
	writeOpenCodeTestConfig(t, writablePath, map[string]any{
		"theme": "dark",
	})

	p := profile.Profile{
		CLI:      agentkind.OpenCode,
		APIStyle: apistyle.Claude,
		BaseURL:  "http://127.0.0.1:8080/proxy/claude/v1",
		APIKey:   "clovapi-key",
		Model:    "test-model",
	}
	if err := (openCodeTarget{}).Apply(p); err != nil {
		t.Fatal(err)
	}

	applied := readOpenCodeTestConfig(t, writablePath)
	providers := mapEntry(t, applied, "provider")
	if _, ok := providers["anthropic"]; ok {
		t.Fatalf("lower-precedence anthropic provider was promoted: %#v", providers["anthropic"])
	}
	if applied["theme"] != "dark" {
		t.Fatalf("theme was not preserved: %v", applied["theme"])
	}
	if applied["model"] != opencodeRelayID+"/test-model" {
		t.Fatalf("model after apply: %v", applied["model"])
	}
	assertOpenCodeStockProvider(t, readOpenCodeTestConfig(t, legacyPath), "anthropic", "https://api.anthropic.example/v1", "user-anthropic-key")

	if err := (openCodeTarget{}).ResetDefault(); err != nil {
		t.Fatal(err)
	}
	reset := readOpenCodeTestConfig(t, writablePath)
	if _, ok := reset["provider"]; ok {
		t.Fatalf("clovapi-only provider object should be removed after reset: %#v", reset["provider"])
	}
	if _, ok := reset["model"]; ok {
		t.Fatalf("model still present after reset: %v", reset["model"])
	}
	if reset["theme"] != "dark" {
		t.Fatalf("theme was not preserved after reset: %v", reset["theme"])
	}
	assertOpenCodeStockProvider(t, readOpenCodeTestConfig(t, legacyPath), "anthropic", "https://api.anthropic.example/v1", "user-anthropic-key")
}

func writeOpenCodeTestConfig(t *testing.T, path string, root map[string]any) {
	t.Helper()
	data, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func readOpenCodeTestConfig(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		t.Fatal(err)
	}
	return root
}

func assertOpenCodeStockProvider(t *testing.T, root map[string]any, id, wantBase, wantKey string) {
	t.Helper()
	opts := mapEntry(t, providerEntry(t, root, id), "options")
	if opts["baseURL"] != wantBase {
		t.Fatalf("%s baseURL: %v", id, opts["baseURL"])
	}
	if opts["apiKey"] != wantKey {
		t.Fatalf("%s apiKey: %v", id, opts["apiKey"])
	}
}

func providerEntry(t *testing.T, root map[string]any, id string) map[string]any {
	t.Helper()
	return mapEntry(t, mapEntry(t, root, "provider"), id)
}

func mapEntry(t *testing.T, root map[string]any, key string) map[string]any {
	t.Helper()
	v, ok := root[key].(map[string]any)
	if !ok || v == nil {
		t.Fatalf("%s is not an object: %#v", key, root[key])
	}
	return v
}

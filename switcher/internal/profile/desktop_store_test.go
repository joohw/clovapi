package profile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	cfgpkg "github.com/clovapi/switcher/internal/config"
)

func writeStoreForTest(t *testing.T, raw string) {
	t.Helper()
	path, err := cfgpkg.ProfilesPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestLoadDesktopStoreV4WithProxyAndVendorModels(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	writeStoreForTest(t, `{
  "version": 4,
  "active": {"codex":"@model:Custom API/gpt-5.5"},
  "proxy": {"enabled": true, "host": "127.0.0.1", "port": 27483},
  "profiles": [
    {
      "name": "Custom API",
      "kind": "api",
      "model_adapter": "manual",
      "models": [
        {"id":"gpt-5.5", "label":"GPT 5.5", "model":"gpt-5.5", "api_style":"openai-responses", "base_url":"https://example.test/v1", "api_key":"secret"}
      ]
    }
  ]
}`)

	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if s.Version != 4 {
		t.Fatalf("version = %d, want 4", s.Version)
	}
	if !s.Proxy.Enabled || s.Proxy.Port != 27483 || s.Proxy.Host != "127.0.0.1" {
		t.Fatalf("proxy config not preserved: %+v", s.Proxy)
	}
	p, ok := s.Get("Custom API")
	if !ok {
		t.Fatal("vendor profile missing")
	}
	if p.Kind != "api" || p.ModelAdapter != "manual" || len(p.Models) != 1 || p.Models[0].Model != "gpt-5.5" {
		t.Fatalf("desktop profile shape not preserved: %+v", p)
	}
	if got := s.Active["codex"]; got != "@model:Custom API/gpt-5.5" {
		t.Fatalf("active binding = %q", got)
	}
}

func TestEmptyStoreDefaultsToDesktopProxyConfig(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if s.Version != StoreVersion {
		t.Fatalf("version = %d", s.Version)
	}
	if !s.Proxy.Enabled || s.Proxy.Host != "127.0.0.1" || s.Proxy.Port != 27483 {
		t.Fatalf("proxy default = %+v", s.Proxy)
	}
}

func TestIngressStyleForCLI(t *testing.T) {
	codexHit := VendorModelHit{
		Vendor: Profile{Kind: "subscription", SubscriptionProviderID: "codex", APIStyle: apistyle.OpenAIResponses},
		Model:  Model{ID: "gpt-5.4", Model: "gpt-5.4", APIStyle: apistyle.OpenAIResponses},
	}
	if got := IngressStyleForCLI(clikind.Hermes, codexHit); got != apistyle.OpenAIResponses {
		t.Fatalf("hermes codex ingress = %q want openai-responses", got)
	}
	claudeHit := VendorModelHit{
		Vendor: Profile{Kind: "subscription", SubscriptionProviderID: "claude-code", APIStyle: apistyle.Claude},
		Model:  Model{ID: "claude-opus-4-7", Model: "claude-opus-4-7", APIStyle: apistyle.Claude},
	}
	if got := IngressStyleForCLI(clikind.Hermes, claudeHit); got != apistyle.Claude {
		t.Fatalf("hermes claude ingress = %q want claude", got)
	}
	if got := IngressStyleForCLI(clikind.Codex, codexHit); got != apistyle.OpenAIResponses {
		t.Fatalf("codex cli ingress = %q", got)
	}
}

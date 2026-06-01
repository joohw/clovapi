package desktop

import (
	"testing"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/usage"
)

func TestResolveVendorCredentialsFallsBackToModelConnection(t *testing.T) {
	baseURL, apiKey, template, err := resolveVendorCredentials(profile.Profile{
		Kind: "api",
		Models: []profile.Model{{
			BaseURL: "https://api.kimi.com/coding/v1",
			APIKey:  "sk-model",
		}},
	})
	if err != nil {
		t.Fatalf("resolveVendorCredentials() err = %v", err)
	}
	if baseURL != "https://api.kimi.com/coding/v1" || apiKey != "sk-model" {
		t.Fatalf("credentials = %q %q", baseURL, apiKey)
	}
	if template != usage.TemplateAuto {
		t.Fatalf("template = %q want %q", template, usage.TemplateAuto)
	}
}

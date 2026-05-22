package profile

import (
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestProfileForDesktopModelBinding(t *testing.T) {
	s := &Store{
		Active: map[string]string{"codex": "@model:自定义 API/gpt-5.5"},
		List: []Profile{{
			Name:         "自定义 API",
			Kind:         "api",
			ModelAdapter: "manual",
			Models: []Model{{
				ID:       "gpt-5.5",
				Model:    "gpt-5.5-upstream",
				APIStyle: apistyle.OpenAIResponses,
				BaseURL:  "https://example.test/v1",
				APIKey:   "secret",
			}},
		}},
	}
	p, ok := s.ActiveForCLI("codex")
	if !ok {
		t.Fatal("desktop binding not resolved")
	}
	if p.Name != "@model:自定义 API/gpt-5.5" || p.Model != "gpt-5.5-upstream" || p.APIStyle != apistyle.OpenAIResponses || p.BaseURL != "https://example.test/v1" || p.APIKey != "secret" {
		t.Fatalf("resolved profile = %+v", p)
	}
	if len(p.Models) != 0 {
		t.Fatalf("resolved profile should be flat, got models: %+v", p.Models)
	}
}

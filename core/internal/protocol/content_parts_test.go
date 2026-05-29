package protocol

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

const testPNGBase64 = "iVBORw0KGgoAAAANSUhEUg=="
const testPNGDataURL = "data:image/png;base64," + testPNGBase64

func mustPrepare(t *testing.T, ingress, egress apistyle.Style, body string) string {
	t.Helper()
	upstream, _, err := PrepareUpstreamRequest(ingress, egress, []byte(body), PrepareOptions{ForceStream: true})
	if err != nil {
		t.Fatalf("prepare %s->%s: %v", ingress, egress, err)
	}
	return string(upstream)
}

func requireAll(t *testing.T, got string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(got, w) {
			t.Fatalf("missing %q in: %s", w, got)
		}
	}
}

// OpenAI Chat (data: URL image) -> Claude should produce a base64 image block.
func TestImageOpenAIChatToClaude(t *testing.T) {
	body := `{
		"model":"claude-sonnet-4-6","stream":true,
		"messages":[{"role":"user","content":[
			{"type":"text","text":"describe this"},
			{"type":"image_url","image_url":{"url":"` + testPNGDataURL + `"}}
		]}]
	}`
	got := mustPrepare(t, apistyle.OpenAIChat, apistyle.Claude, body)
	requireAll(t, got,
		`"type":"image"`,
		`"type":"base64"`,
		`"media_type":"image/png"`,
		testPNGBase64,
		"describe this",
	)
}

// OpenAI Chat (http URL image) -> Claude should use a url image source.
func TestImageOpenAIChatURLToClaude(t *testing.T) {
	body := `{
		"model":"claude-sonnet-4-6","stream":true,
		"messages":[{"role":"user","content":[
			{"type":"image_url","image_url":{"url":"https://example.com/cat.png"}}
		]}]
	}`
	got := mustPrepare(t, apistyle.OpenAIChat, apistyle.Claude, body)
	requireAll(t, got, `"type":"image"`, `"type":"url"`, "https://example.com/cat.png")
}

// Claude (base64 image) -> OpenAI Chat should produce an image_url data URL.
func TestImageClaudeToOpenAIChat(t *testing.T) {
	body := `{
		"model":"gpt-4o","stream":true,
		"messages":[{"role":"user","content":[
			{"type":"text","text":"what is this"},
			{"type":"image","source":{"type":"base64","media_type":"image/png","data":"` + testPNGBase64 + `"}}
		]}]
	}`
	got := mustPrepare(t, apistyle.Claude, apistyle.OpenAIChat, body)
	requireAll(t, got, `"type":"image_url"`, testPNGDataURL, "what is this")
}

// Claude (base64 image) -> OpenAI Responses should produce an input_image item.
func TestImageClaudeToResponses(t *testing.T) {
	body := `{
		"model":"gpt-5","stream":true,"max_tokens":1000,
		"messages":[{"role":"user","content":[
			{"type":"image","source":{"type":"base64","media_type":"image/png","data":"` + testPNGBase64 + `"}}
		]}]
	}`
	got := mustPrepare(t, apistyle.Claude, apistyle.OpenAIResponses, body)
	requireAll(t, got, `"type":"input_image"`, testPNGDataURL)
}

// OpenAI Chat image must round-trip back to OpenAI Chat unchanged in substance.
func TestImageOpenAIChatRoundTrip(t *testing.T) {
	body := `{
		"model":"gpt-4o","stream":true,
		"messages":[{"role":"user","content":[
			{"type":"text","text":"hi"},
			{"type":"image_url","image_url":{"url":"` + testPNGDataURL + `"}}
		]}]
	}`
	got := mustPrepare(t, apistyle.OpenAIChat, apistyle.OpenAIChat, body)
	requireAll(t, got, `"type":"image_url"`, testPNGDataURL, `"type":"text"`, "hi")
}

// Decoder unit check: image parts are captured and text preserved.
func TestDecodeContentPartsShapes(t *testing.T) {
	cases := []struct {
		name string
		in   string
	}{
		{"openai", `[{"type":"text","text":"a"},{"type":"image_url","image_url":{"url":"` + testPNGDataURL + `"}}]`},
		{"responses", `[{"type":"input_text","text":"a"},{"type":"input_image","image_url":"` + testPNGDataURL + `"}]`},
		{"claude", `[{"type":"text","text":"a"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"` + testPNGBase64 + `"}}]`},
		{"gemini", `[{"text":"a"},{"inlineData":{"mimeType":"image/png","data":"` + testPNGBase64 + `"}}]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var v any
			if err := json.Unmarshal([]byte(tc.in), &v); err != nil {
				t.Fatal(err)
			}
			parts, hasImage := decodeContentParts(v)
			if !hasImage {
				t.Fatalf("expected image part for %s", tc.name)
			}
			var sawText, sawImage bool
			for _, p := range parts {
				if p.Type == "text" && p.Text == "a" {
					sawText = true
				}
				if p.Type == "image" && p.Image != nil {
					sawImage = true
				}
			}
			if !sawText || !sawImage {
				t.Fatalf("parts incomplete for %s: %#v", tc.name, parts)
			}
		})
	}
}

package testclient

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
)

// returned when POST …/v1/messages returns 404 so callers can try OpenAI chat on the same host.
var errAnthropicMessagesNotFound = errors.New("anthropic messages not found")

// probeOutputTokens keeps connectivity probes lightweight while avoiding gateways
// that reject extremely small token limits (e.g. max_tokens=1).
const probeOutputTokens = 16

// Probe checks reachability for style using base_url, api_key, and model (all required).
// OpenAI Chat / Responses use their respective POST endpoints; Claude uses Anthropic Messages,
// with a same-host OpenAI chat fallback when Messages returns 404 (unified gateways).
// Gemini uses OpenAI-compatible POST …/chat/completions (typical for gateways exposing Gemini).
func Probe(style apistyle.Style, baseURL, apiKey, model string) error {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return fmt.Errorf("base_url is empty")
	}
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("api_key is empty")
	}
	m := strings.TrimSpace(model)
	if m == "" {
		return fmt.Errorf("model is required")
	}

	switch style {
	case apistyle.OpenAIChat:
		return probeOpenAIChatPOST(base, apiKey, m)
	case apistyle.OpenAIResponses:
		return probeOpenAIResponsesPOST(base, apiKey, m)
	case apistyle.Claude:
		return probeClaudeWithFallback(base, apiKey, m)
	case apistyle.Gemini:
		return probeOpenAIChatPOST(base, apiKey, m)
	default:
		return fmt.Errorf("unsupported style %q", style)
	}
}

// probeClaudeWithFallback tries Anthropic Messages on base, then OpenAI chat on the same origin when Messages is 404.
func probeClaudeWithFallback(base, apiKey, model string) error {
	mErr := probeAnthropicMessagesPOST(base, apiKey, model)
	if mErr == nil {
		return nil
	}
	if !errors.Is(mErr, errAnthropicMessagesNotFound) {
		return mErr
	}
	u, perr := url.Parse(base)
	if perr != nil || u.Host == "" {
		return mErr
	}
	origin := u.Scheme + "://" + u.Host
	return probeOpenAIChatPOST(origin, apiKey, model)
}

func probeAnthropicMessagesPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "messages")
	payload := map[string]any{
		"model":      model,
		"max_tokens": probeOutputTokens,
		"messages":   []any{map[string]any{"role": "user", "content": "."}},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("%w: HTTP %s: %s", errAnthropicMessagesNotFound, resp.Status, strings.TrimSpace(string(body)))
	}
	return fmt.Errorf("HTTP %s: %s", resp.Status, strings.TrimSpace(string(body)))
}

func joinV1Path(base, rest string) string {
	b := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(b, "/v1") {
		return b + "/" + rest
	}
	return b + "/v1/" + rest
}

func probeOpenAIChatPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "chat/completions")
	payload := map[string]any{
		"model":      model,
		"messages":   []any{map[string]any{"role": "user", "content": "."}},
		"max_tokens": probeOutputTokens,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("HTTP %s: %s", resp.Status, strings.TrimSpace(string(body)))
}

func probeOpenAIResponsesPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "responses")
	payload := map[string]any{
		"model":             model,
		"input":             ".",
		"max_output_tokens": probeOutputTokens,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("HTTP %s: %s", resp.Status, strings.TrimSpace(string(body)))
}

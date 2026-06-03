package testclient

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
)

// returned when POST …/v1/messages returns 404 so callers can try OpenAI chat on the same host.
var errAnthropicMessagesNotFound = errors.New("anthropic messages not found")

// probeOutputTokens keeps connectivity probes lightweight while avoiding gateways
// that reject extremely small token limits (e.g. max_tokens=1).
const probeOutputTokens = 16

const toolProbeReplyInstruction = "reply ok of tool response pong"

// Probe checks reachability for style using base_url, api_key, and model (all required).
// Probes use streaming requests to match agent CLIs and subscription upstreams (e.g. Codex /responses).
// Claude uses Anthropic Messages with a same-host OpenAI chat fallback when Messages returns 404.
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

// ProbeToolRoundTrip sends the desktop model-management probe through both
// canonical proxy ingress styles. It intentionally creates two real call-log
// entries: OpenAI Responses and Anthropic Messages, both with a pong tool
// result in context.
func ProbeToolRoundTrip(openAIResponsesBaseURL, claudeMessagesBaseURL, apiKey, model string) error {
	baseResponses := strings.TrimRight(strings.TrimSpace(openAIResponsesBaseURL), "/")
	baseClaude := strings.TrimRight(strings.TrimSpace(claudeMessagesBaseURL), "/")
	if baseResponses == "" {
		return fmt.Errorf("openai responses base_url is empty")
	}
	if baseClaude == "" {
		return fmt.Errorf("claude messages base_url is empty")
	}
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("api_key is empty")
	}
	m := strings.TrimSpace(model)
	if m == "" {
		return fmt.Errorf("model is required")
	}
	var failures []string
	if err := probeOpenAIResponsesToolPOST(baseResponses, apiKey, m); err != nil {
		failures = append(failures, fmt.Sprintf("openai-responses probe: %v", err))
	}
	if err := probeAnthropicMessagesToolPOST(baseClaude, apiKey, m); err != nil {
		failures = append(failures, fmt.Sprintf("anthropic-messages probe: %v", err))
	}
	if len(failures) > 0 {
		return errors.New(strings.Join(failures, "; "))
	}
	return nil
}

// probeClaudeWithFallback tries Anthropic Messages on base, then OpenAI chat on the same base when Messages is 404.
func probeClaudeWithFallback(base, apiKey, model string) error {
	mErr := probeAnthropicMessagesPOST(base, apiKey, model)
	if mErr == nil {
		return nil
	}
	if !errors.Is(mErr, errAnthropicMessagesNotFound) {
		return mErr
	}
	return probeOpenAIChatPOST(base, apiKey, model)
}

func probeAnthropicMessagesPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "messages")
	payload := basicAnthropicMessagesPayload(model)
	return postJSONProbe(u, map[string]string{
		"x-api-key":         apiKey,
		"anthropic-version": "2023-06-01",
		"Content-Type":      "application/json",
	}, payload)
}

func basicAnthropicMessagesPayload(model string) map[string]any {
	return map[string]any{
		"model":      model,
		"max_tokens": probeOutputTokens,
		"stream":     true,
		"messages":   []any{map[string]any{"role": "user", "content": "."}},
	}
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
		"stream":     true,
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
	return readProbeResponse(resp)
}

func probeOpenAIResponsesPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "responses")
	payload := basicOpenAIResponsesPayload(model)
	return postJSONProbe(u, map[string]string{
		"Authorization": "Bearer " + apiKey,
		"Content-Type":  "application/json",
	}, payload)
}

func basicOpenAIResponsesPayload(model string) map[string]any {
	return map[string]any{
		"model":             model,
		"input":             []any{map[string]any{"type": "message", "role": "user", "content": []any{map[string]any{"type": "input_text", "text": "."}}}},
		"max_output_tokens": probeOutputTokens,
		"stream":            true,
	}
}

func probeOpenAIResponsesToolPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "responses")
	return postJSONProbe(u, map[string]string{
		"Authorization": "Bearer " + apiKey,
		"Content-Type":  "application/json",
	}, openAIResponsesToolPayload(model))
}

func probeAnthropicMessagesToolPOST(base, apiKey, model string) error {
	u := joinV1Path(base, "messages")
	return postJSONProbe(u, map[string]string{
		"x-api-key":         apiKey,
		"anthropic-version": "2023-06-01",
		"Content-Type":      "application/json",
	}, anthropicMessagesToolPayload(model))
}

func pongToolParameters() map[string]any {
	return map[string]any{
		"type":                 "object",
		"properties":           map[string]any{},
		"additionalProperties": false,
	}
}

func openAIResponsesToolPayload(model string) map[string]any {
	return map[string]any{
		"model": model,
		"input": []any{
			map[string]any{
				"type": "message",
				"role": "user",
				"content": []any{map[string]any{
					"type": "input_text",
					"text": "Use the provided pong tool result.",
				}},
			},
			map[string]any{
				"type":      "function_call",
				"call_id":   "call_probe_pong",
				"name":      "pong",
				"arguments": "{}",
			},
			map[string]any{
				"type":    "function_call_output",
				"call_id": "call_probe_pong",
				"output":  "pong",
			},
			map[string]any{
				"type": "message",
				"role": "user",
				"content": []any{map[string]any{
					"type": "input_text",
					"text": toolProbeReplyInstruction,
				}},
			},
		},
		"tools": []any{map[string]any{
			"type":        "function",
			"name":        "pong",
			"description": "Returns pong.",
			"parameters":  pongToolParameters(),
		}},
		"max_output_tokens": probeOutputTokens,
		"stream":            true,
		"store":             false,
	}
}

func anthropicMessagesToolPayload(model string) map[string]any {
	return map[string]any{
		"model":      model,
		"max_tokens": probeOutputTokens,
		"stream":     true,
		"tools": []any{map[string]any{
			"name":         "pong",
			"description":  "Returns pong.",
			"input_schema": pongToolParameters(),
		}},
		"messages": []any{
			map[string]any{
				"role":    "user",
				"content": "Use the pong tool.",
			},
			map[string]any{
				"role": "assistant",
				"content": []any{map[string]any{
					"type":  "tool_use",
					"id":    "toolu_probe_pong",
					"name":  "pong",
					"input": map[string]any{},
				}},
			},
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{
						"type":        "tool_result",
						"tool_use_id": "toolu_probe_pong",
						"content":     "pong",
					},
					map[string]any{
						"type": "text",
						"text": toolProbeReplyInstruction,
					},
				},
			},
		},
	}
}

func postJSONProbe(u string, headers map[string]string, payload map[string]any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	return readProbeResponse(resp)
}

func readProbeResponse(resp *http.Response) error {
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if _, err := io.Copy(io.Discard, resp.Body); err != nil {
			return fmt.Errorf("read response: %w", err)
		}
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("%w: HTTP %s: %s", errAnthropicMessagesNotFound, resp.Status, strings.TrimSpace(string(body)))
	}
	return fmt.Errorf("HTTP %s: %s", resp.Status, strings.TrimSpace(string(body)))
}

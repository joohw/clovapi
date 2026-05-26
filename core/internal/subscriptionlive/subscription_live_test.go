//go:build live

package subscriptionlive_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
)

const liveHTTPTimeout = 3 * time.Minute

type liveSub struct {
	name      string
	source    string
	egress    apistyle.Style
	ingress   apistyle.Style
	model     string
	baseURL   string
	apiKey    string
	accountID string
}

func claudeLiveSub(t *testing.T) (liveSub, bool) {
	t.Helper()
	p := profile.Profile{
		Kind:                   "subscription",
		SubscriptionProviderID: provider.ClaudeCodeProviderID,
	}
	profile.HydrateSubscriptionCredentials(&p)
	if strings.TrimSpace(p.BaseURL) == "" || strings.TrimSpace(p.APIKey) == "" {
		t.Skip("Claude Code subscription credentials not found (~/.claude/.credentials.json)")
		return liveSub{}, false
	}
	model := strings.TrimSpace(os.Getenv("CLOVAPI_CLAUDE_MODEL"))
	if model == "" {
		model = "claude-sonnet-4-6"
	}
	return liveSub{
		name:    "claude-code",
		source:  "subscription:claude-code",
		egress:  apistyle.Claude,
		ingress: apistyle.Claude,
		model:   model,
		baseURL: p.BaseURL,
		apiKey:  p.APIKey,
	}, true
}

func codexLiveSub(t *testing.T) (liveSub, bool) {
	t.Helper()
	p := profile.Profile{
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
	}
	profile.HydrateSubscriptionCredentials(&p)
	if strings.TrimSpace(p.BaseURL) == "" || strings.TrimSpace(p.APIKey) == "" {
		t.Skip("Codex subscription credentials not found (~/.codex/auth.json)")
		return liveSub{}, false
	}
	if strings.TrimSpace(p.AccountID) == "" {
		t.Skip("Codex subscription missing account_id in auth.json")
		return liveSub{}, false
	}
	model := strings.TrimSpace(os.Getenv("CLOVAPI_CODEX_MODEL"))
	if model == "" {
		model = "gpt-5.4"
	}
	return liveSub{
		name:      "codex",
		source:    "subscription:codex",
		egress:    apistyle.OpenAIResponses,
		ingress:   apistyle.OpenAIResponses,
		model:     model,
		baseURL:   p.BaseURL,
		apiKey:    p.APIKey,
		accountID: p.AccountID,
	}, true
}

func (s liveSub) post(t *testing.T, ingressBody []byte) (status int, raw []byte, events []protocol.ResponseEvent) {
	t.Helper()
	pathSuffix := proxyresolve.UpstreamPathSuffix(s.egress, s.source)
	upJSON, _, err := protocol.PrepareUpstreamRequest(s.ingress, s.egress, ingressBody, protocol.PrepareOptions{
		Model:       s.model,
		ForceStream: true,
		Configure: func(ir *protocol.Request) {
			applySubscriptionLivePolicy(ir, s.source)
		},
	})
	if err != nil {
		t.Fatalf("%s PrepareUpstreamRequest: %v", s.name, err)
	}
	url := proxyresolve.JoinURL(s.baseURL, pathSuffix)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(upJSON))
	if err != nil {
		t.Fatalf("%s new request: %v", s.name, err)
	}
	hdr := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:     s.egress,
		APIKey:    s.apiKey,
		Source:    s.source,
		AccountID: s.accountID,
		Stream:    true,
	})
	for k, vv := range hdr {
		req.Header[k] = vv
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Encoding", "identity")

	client := &http.Client{Timeout: liveHTTPTimeout}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s upstream request: %v", s.name, err)
	}
	defer resp.Body.Close()
	raw, _ = io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	status = resp.StatusCode
	if status < 200 || status >= 300 {
		t.Logf("%s upstream status=%d body=%s", s.name, status, truncate(string(raw), 800))
		return status, raw, nil
	}
	events = protocol.MaterializeSSEUpstreamEvents(s.egress, raw)
	return status, raw, events
}

func applySubscriptionLivePolicy(r *protocol.Request, source string) {
	if r.Meta == nil {
		r.Meta = &protocol.Metadata{}
	}
	switch strings.TrimSpace(source) {
	case "subscription:codex":
		r.Meta.OpenAIResponsesOmitSampling = true
	case "subscription:claude-code":
		r.Meta.ClaudeOAuthEncodingCompatibility = true
	}
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func aggregateText(events []protocol.ResponseEvent) string {
	var b strings.Builder
	for _, ev := range events {
		if ev.Type == protocol.RespTextDelta && ev.Text != "" {
			b.WriteString(ev.Text)
		}
	}
	return strings.TrimSpace(b.String())
}

func hasFinish(events []protocol.ResponseEvent) bool {
	for _, ev := range events {
		if ev.Type == protocol.RespFinish {
			return true
		}
	}
	return false
}

func hasError(events []protocol.ResponseEvent) (string, bool) {
	for _, ev := range events {
		if ev.Type == protocol.RespError {
			return ev.Message, true
		}
	}
	return "", false
}

func rawContainsAny(raw []byte, needles ...string) bool {
	s := strings.ToLower(string(raw))
	for _, n := range needles {
		if strings.Contains(s, strings.ToLower(n)) {
			return true
		}
	}
	return false
}

func claudeIngress(model string, messages []map[string]any, tools []map[string]any) []byte {
	body := map[string]any{
		"model":      model,
		"max_tokens": 256,
		"stream":     true,
		"messages":   messages,
	}
	if len(tools) > 0 {
		body["tools"] = tools
	}
	raw, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	return raw
}

func codexIngress(model, user string, tools []map[string]any) []byte {
	body := map[string]any{
		"model":        model,
		"stream":       true,
		"store":        false,
		"instructions": "You are a helpful assistant.",
		"input": []any{
			map[string]any{"role": "user", "content": user},
		},
	}
	if len(tools) > 0 {
		body["tools"] = tools
	}
	raw, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	return raw
}

func codexMultiTurnIngress(model string, turns []map[string]string) []byte {
	input := make([]any, 0, len(turns))
	for _, turn := range turns {
		input = append(input, map[string]any{
			"role":    turn["role"],
			"content": turn["content"],
		})
	}
	body := map[string]any{
		"model":        model,
		"stream":       true,
		"store":        false,
		"instructions": "You are a helpful assistant.",
		"input":        input,
	}
	raw, _ := json.Marshal(body)
	return raw
}

func weatherToolOpenAI() []map[string]any {
	return []map[string]any{{
		"type":        "function",
		"name":        "get_weather",
		"description": "Get current weather for a city",
		"parameters": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"city": map[string]any{"type": "string"},
			},
			"required": []any{"city"},
		},
	}}
}

func weatherToolClaude() []map[string]any {
	return []map[string]any{{
		"name":        "get_weather",
		"description": "Get current weather for a city",
		"input_schema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"city": map[string]any{"type": "string"},
			},
			"required": []any{"city"},
		},
	}}
}

func assertSubscriptionOK(t *testing.T, sub liveSub, status int, raw []byte, events []protocol.ResponseEvent) {
	t.Helper()
	if status < 200 || status >= 300 {
		t.Fatalf("%s: HTTP %d", sub.name, status)
	}
	if msg, bad := hasError(events); bad {
		t.Fatalf("%s: upstream error event: %s", sub.name, msg)
	}
	if !hasFinish(events) {
		t.Fatalf("%s: stream missing terminal finish event; raw=%s", sub.name, truncate(string(raw), 400))
	}
	if !protocol.LooksLikeSSEWire(raw) {
		t.Fatalf("%s: response does not look like SSE", sub.name)
	}
}

func TestClaudeSubscription_ShortDialog(t *testing.T) {
	sub, ok := claudeLiveSub(t)
	if !ok {
		return
	}
	body := claudeIngress(sub.model, []map[string]any{
		{"role": "user", "content": "Reply with exactly: ping-ok"},
	}, nil)
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	text := aggregateText(events)
	t.Logf("claude short reply: %q (events=%d)", text, len(events))
}

func TestClaudeSubscription_LongDialog(t *testing.T) {
	sub, ok := claudeLiveSub(t)
	if !ok {
		return
	}
	longCtx := strings.Repeat("The quick brown fox jumps over the lazy dog. ", 40)
	body := claudeIngress(sub.model, []map[string]any{
		{"role": "user", "content": longCtx + "\n\nSummarize the animal and action in one short English phrase."},
	}, nil)
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	text := aggregateText(events)
	if text == "" {
		t.Fatalf("claude long dialog: empty text delta")
	}
	t.Logf("claude long reply (%d chars): %q", len(text), truncate(text, 200))
}

func TestClaudeSubscription_MultiTurn(t *testing.T) {
	sub, ok := claudeLiveSub(t)
	if !ok {
		return
	}
	body := claudeIngress(sub.model, []map[string]any{
		{"role": "user", "content": "My name is Ada."},
		{"role": "assistant", "content": "Hello Ada, nice to meet you."},
		{"role": "user", "content": "What is my name? Reply with only the name."},
	}, nil)
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	text := strings.ToLower(aggregateText(events))
	if !strings.Contains(text, "ada") {
		t.Fatalf("claude multi-turn: expected Ada in %q", text)
	}
	t.Logf("claude multi-turn reply: %q", text)
}

func TestClaudeSubscription_ToolCall(t *testing.T) {
	sub, ok := claudeLiveSub(t)
	if !ok {
		return
	}
	body := claudeIngress(sub.model, []map[string]any{
		{"role": "user", "content": "What's the weather in Tokyo? Use the get_weather tool."},
	}, weatherToolClaude())
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	if !rawContainsAny(raw, "tool_use", "input_json_delta", "content_block_start") {
		t.Fatalf("claude tool call: SSE missing tool_use markers; text=%q raw=%s",
			aggregateText(events), truncate(string(raw), 600))
	}
	t.Logf("claude tool call ok; text=%q", truncate(aggregateText(events), 120))
}

func TestCodexSubscription_ShortDialog(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	body := codexIngress(sub.model, "Reply with exactly: ping-ok", nil)
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	text := aggregateText(events)
	t.Logf("codex short reply: %q (events=%d)", text, len(events))
}

func TestCodexSubscription_LongDialog(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	longCtx := strings.Repeat("Pack my box with five dozen liquor jugs. ", 35)
	body := codexIngress(sub.model, longCtx+"\n\nReply with a one-sentence summary.", nil)
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	text := aggregateText(events)
	if text == "" {
		t.Fatalf("codex long dialog: empty text delta")
	}
	t.Logf("codex long reply (%d chars): %q", len(text), truncate(text, 200))
}

func TestCodexSubscription_MultiTurn(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	body := codexMultiTurnIngress(sub.model, []map[string]string{
		{"role": "user", "content": "My name is Ada."},
		{"role": "assistant", "content": "Hello Ada, nice to meet you."},
		{"role": "user", "content": "What is my name? Reply with only the name."},
	})
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	text := strings.ToLower(aggregateText(events))
	if !strings.Contains(text, "ada") {
		t.Fatalf("codex multi-turn: expected Ada in %q", text)
	}
	t.Logf("codex multi-turn reply: %q", text)
}

func TestCodexSubscription_ToolCall(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	body := codexIngress(sub.model, "What's the weather in Tokyo? Call get_weather.", weatherToolOpenAI())
	status, raw, events := sub.post(t, body)
	assertSubscriptionOK(t, sub, status, raw, events)
	if !rawContainsAny(raw, "function_call", "tool_call", "output_item", "call_id") {
		t.Fatalf("codex tool call: SSE missing function_call markers; text=%q raw=%s",
			aggregateText(events), truncate(string(raw), 600))
	}
	t.Logf("codex tool call ok; text=%q", truncate(aggregateText(events), 120))
}

func TestMain(m *testing.M) {
	fmt.Println("subscriptionlive: real upstream tests (build tag live)")
	os.Exit(m.Run())
}

//go:build live

package protocol_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
)

const captureFixturePrompt = "Reply with exactly: fixture-ok"
const captureHTTPTimeout = 2 * time.Minute

func testdataSSEDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Join(filepath.Dir(file), "testdata", "sse")
}

func captureSubscriptionSSE(t *testing.T, egress apistyle.Style, source, baseURL, apiKey, accountID, model string, ingressBody []byte, outName string) {
	t.Helper()
	pathSuffix := proxyresolve.UpstreamPathSuffix(egress, source)
	upJSON, _, err := protocol.PrepareUpstreamRequest(egress, egress, ingressBody, protocol.PrepareOptions{
		Model:       model,
		ForceStream: true,
		Configure: func(ir *protocol.Request) {
			applySubscriptionCapturePolicy(ir, source)
		},
	})
	if err != nil {
		t.Fatalf("PrepareUpstreamRequest: %v", err)
	}
	url := proxyresolve.JoinURL(baseURL, pathSuffix)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(upJSON))
	if err != nil {
		t.Fatal(err)
	}
	hdr := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:     egress,
		APIKey:    apiKey,
		Source:    source,
		AccountID: accountID,
		Stream:    true,
	})
	for k, vv := range hdr {
		req.Header[k] = vv
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Encoding", "identity")

	client := &http.Client{Timeout: captureHTTPTimeout}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("upstream: %v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		t.Fatalf("HTTP %d: %s", resp.StatusCode, truncateCapture(string(raw), 600))
	}
	if !protocol.LooksLikeSSEWire(raw) {
		t.Fatalf("upstream body is not SSE-shaped: %s", truncateCapture(string(raw), 400))
	}
	events := protocol.MaterializeSSEUpstreamEvents(egress, raw)
	text := aggregateCaptureText(events)
	if !strings.Contains(text, "fixture-ok") {
		t.Fatalf("expected fixture-ok in decoded text, got %q events=%d raw=%s", text, len(events), truncateCapture(string(raw), 400))
	}

	outPath := filepath.Join(testdataSSEDir(t), outName)
	if err := os.WriteFile(outPath, normalizeSSEFixture(raw), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("wrote %s (%d bytes, text=%q)", outPath, len(raw), text)
}

func applySubscriptionCapturePolicy(r *protocol.Request, source string) {
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

func normalizeSSEFixture(raw []byte) []byte {
	// Trim trailing whitespace; ensure single trailing newline for stable diffs.
	s := strings.TrimRight(string(raw), " \t\r\n")
	if s == "" {
		return []byte("\n")
	}
	return []byte(s + "\n")
}

func truncateCapture(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func aggregateCaptureText(events []protocol.ResponseEvent) string {
	var b strings.Builder
	for _, ev := range events {
		if ev.Type == protocol.RespTextDelta {
			b.WriteString(ev.Text)
		}
	}
	return strings.TrimSpace(b.String())
}

func claudeCaptureIngress(model string) []byte {
	body := map[string]any{
		"model":      model,
		"max_tokens": 64,
		"stream":     true,
		"messages": []any{
			map[string]any{"role": "user", "content": captureFixturePrompt},
		},
	}
	raw, _ := json.Marshal(body)
	return raw
}

func codexCaptureIngress(model string) []byte {
	body := map[string]any{
		"model":        model,
		"stream":       true,
		"store":        false,
		"instructions": "You are a helpful assistant.",
		"input": []any{
			map[string]any{"role": "user", "content": captureFixturePrompt},
		},
	}
	raw, _ := json.Marshal(body)
	return raw
}

func TestCaptureClaudeSubscriptionSSEFixture(t *testing.T) {
	p := profile.Profile{
		Kind:                   "subscription",
		SubscriptionProviderID: provider.ClaudeCodeProviderID,
	}
	profile.HydrateSubscriptionCredentials(&p)
	if strings.TrimSpace(p.APIKey) == "" {
		t.Skip("no Claude Code subscription credentials")
	}
	model := strings.TrimSpace(os.Getenv("CLOVAPI_CLAUDE_MODEL"))
	if model == "" {
		model = "claude-sonnet-4-6"
	}
	captureSubscriptionSSE(t,
		apistyle.Claude,
		"subscription:claude-code",
		p.BaseURL,
		p.APIKey,
		"",
		model,
		claudeCaptureIngress(model),
		"claude_subscription.sse",
	)
}

func TestCaptureCodexSubscriptionSSEFixture(t *testing.T) {
	p := profile.Profile{
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
	}
	profile.HydrateSubscriptionCredentials(&p)
	if strings.TrimSpace(p.APIKey) == "" || strings.TrimSpace(p.AccountID) == "" {
		t.Skip("no Codex subscription credentials")
	}
	model := strings.TrimSpace(os.Getenv("CLOVAPI_CODEX_MODEL"))
	if model == "" {
		model = "gpt-5.4"
	}
	captureSubscriptionSSE(t,
		apistyle.OpenAIResponses,
		"subscription:codex",
		p.BaseURL,
		p.APIKey,
		p.AccountID,
		model,
		codexCaptureIngress(model),
		"codex_subscription.sse",
	)
}

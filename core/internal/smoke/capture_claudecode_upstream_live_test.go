//go:build live

package smoke_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

// captureRecorder stands in for the Claude Code (Anthropic) upstream and records
// every request body clovapi forwards after transcoding + OAuth-compat encoding.
type captureRecorder struct {
	mu     sync.Mutex
	bodies [][]byte
}

func (r *captureRecorder) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		r.mu.Lock()
		r.bodies = append(r.bodies, append([]byte(nil), body...))
		r.mu.Unlock()
		// Reply with a minimal valid Claude Messages SSE so the agent completes.
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, strings.Join([]string{
			`event: message_start`,
			`data: {"type":"message_start","message":{"id":"msg_cap","type":"message","role":"assistant","model":"claude","content":[],"usage":{"input_tokens":0,"output_tokens":0}}}`,
			``,
			`event: content_block_start`,
			`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
			``,
			`event: content_block_delta`,
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}`,
			``,
			`event: content_block_stop`,
			`data: {"type":"content_block_stop","index":0}`,
			``,
			`event: message_delta`,
			`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}`,
			``,
			`event: message_stop`,
			`data: {"type":"message_stop"}`,
			``,
		}, "\n"))
	})
}

func (r *captureRecorder) countSince(start int) [][]byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	if start >= len(r.bodies) {
		return nil
	}
	out := make([][]byte, len(r.bodies)-start)
	copy(out, r.bodies[start:])
	return out
}

func (r *captureRecorder) total() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.bodies)
}

// TestCaptureClaudeCodeUpstreamBodies records the Claude Messages JSON that Codex,
// OpenClaw and Hermes each send to the Claude Code upstream through clovapi, so the
// third-party-classifier surface (system prompt shape + tool names) can be compared.
func TestCaptureClaudeCodeUpstreamBodies(t *testing.T) {
	kinds := smokeRequireAgentsInstalled(t, []agentkind.Kind{
		agentkind.Codex,
		agentkind.OpenClaw,
		agentkind.Hermes,
	})
	home := smokeIsolatedHome(t)

	claudeModel := strings.TrimSpace(os.Getenv("CLOVAPI_CLAUDE_MODEL"))
	if claudeModel == "" {
		claudeModel = claudeDefaultModel
	}

	rec := &captureRecorder{}
	upstream := httptest.NewServer(rec.handler())
	t.Cleanup(upstream.Close)

	store := &profile.Store{
		Version: profile.StoreVersion,
		Active:  map[string]profile.ActiveSelection{},
		Proxy:   profile.ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27483},
		List: []profile.Profile{{
			Name:                   provider.ClaudeCodeVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.ClaudeCodeProviderID,
			ModelAdapter:           "subscription",
			APIStyle:               apistyle.Claude,
			BaseURL:                strings.TrimRight(upstream.URL, "/"),
			APIKey:                 "sk-ant-oat01-capture",
			Model:                  claudeModel,
			Models: []profile.Model{{
				ID:       claudeModel,
				Label:    claudeModel,
				Model:    claudeModel,
				APIStyle: apistyle.Claude,
				BaseURL:  strings.TrimRight(upstream.URL, "/"),
				APIKey:   "sk-ant-oat01-capture",
			}},
		}},
	}

	baseURL, _ := smokeProxyBaseURL(t, store)

	dumpDir, err := os.MkdirTemp("", "clovapi-cc-capture-")
	if err != nil {
		t.Fatalf("create dump dir: %v", err)
	}
	t.Logf("capture dump dir: %s", dumpDir)

	styles := []apistyle.Style{apistyle.Claude, apistyle.OpenAIResponses}
	for _, kind := range kinds {
		for _, style := range styles {
			if !apply.KindSupportsStyle(kind, style) {
				continue
			}
			cell := fmt.Sprintf("%s/%s", kind, style)
			t.Run(cell, func(t *testing.T) {
				proxyBase := smokeIngressBaseURL(baseURL, provider.ClaudeCodeProviderID, claudeModel, style)
				p := profile.Profile{
					Name:                   "capture",
					Kind:                   "subscription",
					SubscriptionProviderID: provider.ClaudeCodeProviderID,
					CLI:                    kind,
					APIStyle:               style,
					BaseURL:                proxyBase,
					APIKey:                 smokeAPIKey,
					Model:                  claudeModel,
				}
				if err := apply.Apply(p); err != nil {
					t.Skipf("apply failed: %v", err)
					return
				}
				start := rec.total()
				out, runErr := smokeRunAgentCLI(t.Context(), kind, home, claudeModel)
				captured := rec.countSince(start)
				if len(captured) == 0 {
					t.Skipf("no upstream body captured (agent err=%v): %s", runErr, truncate(out, 300))
					return
				}
				body := captured[0]
				fname := filepath.Join(dumpDir, fmt.Sprintf("%s.%s.json", kind, style))
				if err := os.WriteFile(fname, prettyJSON(body), 0o600); err != nil {
					t.Fatalf("write dump: %v", err)
				}
				logUpstreamBodySummary(t, string(kind), string(style), body, fname)
			})
		}
	}
	t.Logf("captured %d upstream request bodies total under %s", rec.total(), dumpDir)
}

func prettyJSON(body []byte) []byte {
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		return body
	}
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return body
	}
	return out
}

func logUpstreamBodySummary(t *testing.T, agent, style string, body []byte, fname string) {
	t.Helper()
	var raw map[string]any
	_ = json.Unmarshal(body, &raw)

	systemText := claudeSystemTextFromBody(raw["system"])
	toolNames := claudeToolNamesFromBody(raw["tools"])
	lower := strings.ToLower(string(body))
	flags := []string{}
	for _, needle := range []string{"hermes", "openclaw", "opencode"} {
		if strings.Contains(lower, needle) {
			flags = append(flags, needle)
		}
	}
	flagStr := "none"
	if len(flags) > 0 {
		flagStr = strings.Join(flags, ",")
	}

	t.Logf("[%s/%s] bodyBytes=%d systemChars=%d tools=%d brandLeaks=%s file=%s",
		agent, style, len(body), len(systemText), len(toolNames), flagStr, fname)
	t.Logf("[%s/%s] toolNames=%v", agent, style, toolNames)
	t.Logf("[%s/%s] systemHead=%q", agent, style, truncate(systemText, 400))
}

func claudeSystemTextFromBody(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case []any:
		parts := make([]string, 0, len(x))
		for _, item := range x {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if s, ok := m["text"].(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "\n\n")
	default:
		return ""
	}
}

func claudeToolNamesFromBody(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if name, ok := m["name"].(string); ok && strings.TrimSpace(name) != "" {
			out = append(out, name)
		}
	}
	return out
}

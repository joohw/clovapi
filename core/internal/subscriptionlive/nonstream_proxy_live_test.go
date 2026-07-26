//go:build live

package subscriptionlive_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/profile"
	coreproxy "github.com/clovapi/switcher/internal/proxy"
)

func liveProxyServer(t *testing.T) *httptest.Server {
	t.Helper()
	s := coreproxy.NewServer(profile.ProxyConfig{Host: "127.0.0.1"})
	return httptest.NewServer(s.Server.Handler)
}

func postLiveProxy(t *testing.T, url string, body map[string]any) (*http.Response, []byte) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: liveHTTPTimeout}).Do(req)
	if err != nil {
		t.Fatalf("proxy request: %v", err)
	}
	defer resp.Body.Close()
	reply, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		t.Fatalf("read proxy response: %v", err)
	}
	return resp, reply
}

func assertLiveJSONResponse(t *testing.T, resp *http.Response, body []byte) {
	t.Helper()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		t.Fatalf("proxy HTTP %d: %s", resp.StatusCode, truncate(string(body), 800))
	}
	if ct := strings.ToLower(resp.Header.Get("Content-Type")); !strings.Contains(ct, "application/json") {
		t.Fatalf("expected application/json, got %q: %s", ct, truncate(string(body), 400))
	}
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("invalid JSON response: %v: %s", err, truncate(string(body), 400))
	}
}

func assertLiveUsage(t *testing.T, body []byte, inputKey, outputKey string) {
	t.Helper()
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatal(err)
	}
	usage, ok := decoded["usage"].(map[string]any)
	if !ok {
		t.Fatalf("response missing usage: %s", truncate(string(body), 800))
	}
	input, inputOK := usage[inputKey].(float64)
	output, outputOK := usage[outputKey].(float64)
	if !inputOK || !outputOK || input <= 0 || output <= 0 {
		t.Fatalf("invalid usage %s=%v %s=%v: %#v", inputKey, usage[inputKey], outputKey, usage[outputKey], usage)
	}
	t.Logf("usage %s=%.0f %s=%.0f", inputKey, input, outputKey, output)
}

func TestProxyCodexSubscription_NonStreamExplicitFalse(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	ts := liveProxyServer(t)
	defer ts.Close()

	resp, body := postLiveProxy(t,
		ts.URL+"/codex/"+sub.model+"/openai-responses/v1/responses",
		map[string]any{
			"model":        sub.model,
			"stream":       false,
			"store":        false,
			"instructions": "Reply with exactly: nonstream-ok",
			"input":        "Reply with exactly: nonstream-ok",
		},
	)
	assertLiveJSONResponse(t, resp, body)
	if !strings.Contains(strings.ToLower(string(body)), "nonstream-ok") {
		t.Fatalf("expected model reply in JSON: %s", truncate(string(body), 800))
	}
	assertLiveUsage(t, body, "input_tokens", "output_tokens")
	t.Logf("codex explicit stream:false returned JSON (%d bytes)", len(body))
}

func TestProxyCodexSubscription_NonStreamDefaultWhenOmitted(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	ts := liveProxyServer(t)
	defer ts.Close()

	resp, body := postLiveProxy(t,
		ts.URL+"/codex/"+sub.model+"/openai-responses/v1/responses",
		map[string]any{
			"model":        sub.model,
			"store":        false,
			"instructions": "Reply with exactly: default-ok",
			"input":        "Reply with exactly: default-ok",
		},
	)
	assertLiveJSONResponse(t, resp, body)
	if !strings.Contains(strings.ToLower(string(body)), "default-ok") {
		t.Fatalf("expected model reply in JSON: %s", truncate(string(body), 800))
	}
	assertLiveUsage(t, body, "input_tokens", "output_tokens")
	t.Logf("codex omitted stream returned JSON (%d bytes)", len(body))
}

func TestProxyClaudeSubscription_NonStreamExplicitFalse(t *testing.T) {
	sub, ok := claudeLiveSub(t)
	if !ok {
		return
	}
	ts := liveProxyServer(t)
	defer ts.Close()

	resp, body := postLiveProxy(t,
		ts.URL+"/claude-code/"+sub.model+"/claude/v1/messages",
		map[string]any{
			"model":      sub.model,
			"stream":     false,
			"max_tokens": 32,
			"messages": []map[string]any{{
				"role":    "user",
				"content": "Reply with exactly: claude-ok",
			}},
		},
	)
	assertLiveJSONResponse(t, resp, body)
	if !strings.Contains(strings.ToLower(string(body)), "claude-ok") {
		t.Fatalf("expected model reply in JSON: %s", truncate(string(body), 800))
	}
	assertLiveUsage(t, body, "input_tokens", "output_tokens")
	t.Logf("claude explicit stream:false returned JSON (%d bytes)", len(body))
}

func TestProxyCodexSubscription_StreamTrueStillSSE(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	ts := liveProxyServer(t)
	defer ts.Close()

	resp, body := postLiveProxy(t,
		ts.URL+"/codex/"+sub.model+"/openai-responses/v1/responses",
		map[string]any{
			"model":        sub.model,
			"stream":       true,
			"store":        false,
			"instructions": "Reply with exactly: stream-ok",
			"input":        "Reply with exactly: stream-ok",
		},
	)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		t.Fatalf("proxy HTTP %d: %s", resp.StatusCode, truncate(string(body), 800))
	}
	if ct := strings.ToLower(resp.Header.Get("Content-Type")); !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("expected text/event-stream, got %q: %s", ct, truncate(string(body), 400))
	}
	if !protocolLooksLikeSSE(body) || !strings.Contains(strings.ToLower(string(body)), "stream-ok") {
		t.Fatalf("expected streamed model reply: %s", truncate(string(body), 800))
	}
	if !strings.Contains(string(body), `"usage"`) ||
		!strings.Contains(string(body), `"input_tokens"`) ||
		!strings.Contains(string(body), `"output_tokens"`) {
		t.Fatalf("stream missing usage: %s", truncate(string(body), 800))
	}
	t.Logf("codex stream:true returned SSE (%d bytes)", len(body))
}

func TestProxyCodexSubscription_NonStreamCrossProtocol(t *testing.T) {
	sub, ok := codexLiveSub(t)
	if !ok {
		return
	}
	ts := liveProxyServer(t)
	defer ts.Close()

	tests := []struct {
		name string
		path string
		body map[string]any
		want string
	}{
		{
			name: "openai-chat",
			path: "/codex/" + sub.model + "/openai-chat/v1/chat/completions",
			body: map[string]any{
				"model":  sub.model,
				"stream": false,
				"messages": []map[string]any{{
					"role":    "user",
					"content": "Reply with exactly: chat-ok",
				}},
			},
			want: "chat-ok",
		},
		{
			name: "claude",
			path: "/codex/" + sub.model + "/claude/v1/messages",
			body: map[string]any{
				"model":      sub.model,
				"stream":     false,
				"max_tokens": 32,
				"messages": []map[string]any{{
					"role":    "user",
					"content": "Reply with exactly: bridge-ok",
				}},
			},
			want: "bridge-ok",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := postLiveProxy(t, ts.URL+tc.path, tc.body)
			assertLiveJSONResponse(t, resp, body)
			if !strings.Contains(strings.ToLower(string(body)), tc.want) {
				t.Fatalf("expected %q in JSON: %s", tc.want, truncate(string(body), 800))
			}
			switch tc.name {
			case "openai-chat":
				assertLiveUsage(t, body, "prompt_tokens", "completion_tokens")
			case "claude":
				assertLiveUsage(t, body, "input_tokens", "output_tokens")
			}
			t.Logf("codex -> %s non-stream returned JSON (%d bytes)", tc.name, len(body))
		})
	}
}

func protocolLooksLikeSSE(body []byte) bool {
	s := strings.TrimSpace(string(body))
	return strings.HasPrefix(s, "event:") || strings.HasPrefix(s, "data:")
}

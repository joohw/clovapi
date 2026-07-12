package proxy

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/syslog"
)

func newTestServer(cfg profile.ProxyConfig) *Server {
	s := NewServer(cfg)
	_ = s.CallLogs.Close()
	s.CallLogs = nil
	return s
}

func TestNewTestServerDoesNotUseUserCallLogStore(t *testing.T) {
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	if s.CallLogs != nil {
		t.Fatal("test server should not attach the user call log store")
	}
}

func TestServerHealthAndModelsList(t *testing.T) {
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.ClaudeCodeVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.ClaudeCodeProviderID,
			Models: []profile.Model{{
				ID:    "claude-opus-4",
				Model: "claude-opus-4",
			}},
		}},
	}
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", resp.StatusCode)
	}
	var health Health
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		t.Fatal(err)
	}
	if !health.OK || health.Service != "clovapi-core-proxy" || health.Version == "" {
		t.Fatalf("health = %+v", health)
	}

	resp, err = http.Get(ts.URL + "/claude-code/claude-opus-4/claude/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("models status = %d", resp.StatusCode)
	}
	var legacyBody struct {
		Data []struct {
			ID      string `json:"id"`
			Object  string `json:"object"`
			OwnedBy string `json:"owned_by"`
		} `json:"data"`
		Object string `json:"object"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&legacyBody); err != nil {
		t.Fatal(err)
	}
	if legacyBody.Object != "list" || len(legacyBody.Data) != 1 || legacyBody.Data[0].ID != "claude-opus-4" {
		t.Fatalf("models body = %+v", legacyBody)
	}

	resp, err = http.Get(ts.URL + "/claude-code/claude%20opus%2F4/claude/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("encoded slash models status = %d", resp.StatusCode)
	}
	var encodedBody struct {
		Data []struct {
			ID     string `json:"id"`
			Object string `json:"object"`
		} `json:"data"`
		Object string `json:"object"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&encodedBody); err != nil {
		t.Fatal(err)
	}
	if encodedBody.Object != "list" || len(encodedBody.Data) != 1 || encodedBody.Data[0].ID != "claude-opus-4" {
		t.Fatalf("encoded slash models body = %+v", encodedBody)
	}
}

func TestDebugUsageReturnsCoreCacheEnvelope(t *testing.T) {
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:          provider.OllamaVendorName,
			Kind:          "local",
			LocalProvider: "ollama",
		}},
	}
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/__debug/usage?refresh=1")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("usage status = %d", resp.StatusCode)
	}
	var body UsagePollerSnapshot
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.OK || len(body.Usages) != 0 || body.UpdatedAt == "" {
		t.Fatalf("usage body = %+v", body)
	}
}

func TestDebugRoutesReturnsDerivedBackends(t *testing.T) {
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:         profile.CustomAPIProfileName,
			Kind:         "api",
			ModelAdapter: "manual",
			Models: []profile.Model{{
				ID:       "gpt-5.5",
				Model:    "gpt-5.5",
				APIStyle: apistyle.OpenAIResponses,
			}},
		}},
	}
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/__debug/routes?provider_id=custom&model_id=gpt-5.5")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("routes status = %d", resp.StatusCode)
	}
	var body struct {
		OK       bool `json:"ok"`
		Backends []struct {
			ID         string `json:"id"`
			ProviderID string `json:"provider_id"`
			ModelID    string `json:"model_id"`
			SourceType string `json:"source_type"`
		} `json:"backends"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.OK || len(body.Backends) != 1 {
		t.Fatalf("routes body = %+v", body)
	}
	if body.Backends[0].ProviderID != provider.CustomAPIProviderID ||
		body.Backends[0].ModelID != "gpt-5.5" ||
		body.Backends[0].SourceType != "api" {
		t.Fatalf("backend = %+v", body.Backends[0])
	}
}

func TestShouldRecordStreamErrorIgnoresContextCanceled(t *testing.T) {
	if shouldRecordStreamError(context.Canceled) {
		t.Fatal("context.Canceled should be treated as downstream cancellation")
	}
	if !shouldRecordStreamError(io.ErrUnexpectedEOF) {
		t.Fatal("unexpected EOF should still be recorded")
	}
}

func TestDebugCallLogPaginatesDefaultLimit(t *testing.T) {
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.CallLogs = openTestCallLogStore(t)
	for i := 0; i < 25; i++ {
		s.CallLogs.Push(CallLogEntry{
			StartedAt: "2026-01-01T00:00:" + strconv.Itoa(10+i) + "Z",
			Request:   CallLogRequest{Method: "POST", URL: "/entry-" + strconv.Itoa(i)},
		})
	}
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/__debug/call-log")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Entries []CallLogEntry `json:"entries"`
		Limit   int            `json:"limit"`
		Offset  int            `json:"offset"`
		HasMore bool           `json:"hasMore"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Limit != 20 || body.Offset != 0 || !body.HasMore {
		t.Fatalf("pagination = limit %d offset %d hasMore %v", body.Limit, body.Offset, body.HasMore)
	}
	if len(body.Entries) != 20 {
		t.Fatalf("entries len = %d, want 20", len(body.Entries))
	}
}

func TestDebugCallLogFiltersByAPIKeyQuery(t *testing.T) {
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.CallLogs = openTestCallLogStore(t)
	s.CallLogs.Push(CallLogEntry{
		StartedAt: "2026-01-01T00:00:01Z",
		APIKey:    &CallLogAPIKey{Label: "Bearer clovapi-test", Fingerprint: apiKeyFingerprint("clovapi-test")},
		Request:   CallLogRequest{Method: "POST", URL: "/matching"},
	})
	s.CallLogs.Push(CallLogEntry{
		StartedAt: "2026-01-01T00:00:02Z",
		APIKey:    &CallLogAPIKey{Label: "Bearer other", Fingerprint: apiKeyFingerprint("other")},
		Request:   CallLogRequest{Method: "POST", URL: "/other"},
	})
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/__debug/call-log?api_key=clovapi-test")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Entries []CallLogEntry `json:"entries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) != 1 || body.Entries[0].Request.URL != "/matching" {
		t.Fatalf("filtered entries = %+v", body.Entries)
	}
}

func TestDebugSystemLogPaginatesDefaultLimit(t *testing.T) {
	dir := t.TempDir()
	config.SetDirOverride(dir)
	t.Cleanup(func() { config.SetDirOverride("") })

	for i := 0; i < 25; i++ {
		syslog.Write("system", "entry-"+strconv.Itoa(i))
	}
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	t.Cleanup(func() { _ = s.CallLogs.Close() })
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/__debug/system-log")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Entries []syslog.Entry `json:"entries"`
		Limit   int            `json:"limit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Limit != 20 {
		t.Fatalf("limit = %d, want 20", body.Limit)
	}
	if len(body.Entries) != 20 {
		t.Fatalf("entries len = %d, want 20", len(body.Entries))
	}
}

func TestDebugRoutesAllowNonLoopbackClientsByDefault(t *testing.T) {
	s := newTestServer(profile.ProxyConfig{Host: "0.0.0.0", Port: 27483})
	s.CallLogs = openTestCallLogStore(t)
	req := httptest.NewRequest(http.MethodGet, "http://example.com/__debug/call-log", nil)
	req.RemoteAddr = "203.0.113.10:45678"
	rec := httptest.NewRecorder()

	s.Server.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestDebugRoutesIgnoreLocalOnlyCompatibilityFlag(t *testing.T) {
	s := newTestServer(profile.ProxyConfig{Host: "0.0.0.0", Port: 27483, DebugLocalOnly: true})
	s.CallLogs = openTestCallLogStore(t)
	req := httptest.NewRequest(http.MethodGet, "http://example.com/__debug/call-log", nil)
	req.RemoteAddr = "203.0.113.10:45678"
	rec := httptest.NewRecorder()

	s.Server.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestServerCodexModelsListReturnsLocalVendorModels(t *testing.T) {
	upstreamHit := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHit = true
		http.Error(w, "should not be called", http.StatusTeapot)
	}))
	defer upstream.Close()

	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			BaseURL:                strings.TrimRight(upstream.URL, "/") + "/backend-api",
			APIKey:                 "codex-token",
			AccountID:              "acct-test",
			Models: []profile.Model{{
				ID:    "gpt-5.4",
				Model: "gpt-5.4",
			}, {
				ID:    "gpt-5.3",
				Model: "gpt-5.3",
			}},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/codex/gpt-5.4/openai-responses/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var body struct {
		Object string `json:"object"`
		Data   []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if upstreamHit {
		t.Fatal("models list should be served from local vendor models, not upstream")
	}
	if body.Object != "list" || len(body.Data) != 2 || body.Data[0].ID != "gpt-5.4" || body.Data[1].ID != "gpt-5.3" {
		t.Fatalf("body = %+v", body)
	}
}

func fixtureDesktopCustomAPIStore() *profile.Store {
	return &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:         provider.CustomAPIVendorName,
			Kind:         "api",
			ModelAdapter: "manual",
			Models: []profile.Model{{
				ID:       "gpt-demo",
				Model:    "gpt-demo-wire",
				APIStyle: apistyle.OpenAIResponses,
				BaseURL:  "https://gw.example/v1/",
				APIKey:   "sk-masked-but-never-sent-in-debug-headers",
			}},
		}},
	}
}

func TestDebugEndpointsWithoutSecrets(t *testing.T) {
	st := fixtureDesktopCustomAPIStore()
	srv := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	srv.ProfileLoader = func() (*profile.Store, error) { return st, nil }
	ts := httptest.NewServer(srv.Server.Handler)
	defer ts.Close()

	resolveURL := ts.URL + "/__debug/resolve-route?provider_id=custom&model_id=gpt-demo&ingress_style=openai-chat"
	resp, err := http.Get(resolveURL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("resolve-route status=%d", resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "sk-masked") {
		t.Fatalf("debug endpoint leaked api key substring")
	}
	var ctxPayload map[string]any
	if err := json.Unmarshal(raw, &ctxPayload); err != nil {
		t.Fatal(err)
	}
	if _, has := ctxPayload["api_key"]; has {
		t.Fatalf("should not serialize api keys: %#v", ctxPayload)
	}

	payload := map[string]any{
		"ingress_style": "openai-chat",
		"egress_style":  "claude",
		"upstream":      map[string]any{"model": "wired-model-from-proxy"},
		"ingress_body": map[string]any{
			"model":    "gpt-demo",
			"messages": []any{map[string]any{"role": "user", "content": "ping"}},
			"stream":   false,
		},
	}
	pb, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	tr, err := http.Post(ts.URL+"/__debug/transform-request", "application/json", bytes.NewReader(pb))
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Body.Close()
	var trBody map[string]any
	if err := json.NewDecoder(tr.Body).Decode(&trBody); err != nil {
		t.Fatal(err)
	}
	if tr.StatusCode != http.StatusOK || trBody["error"] != nil {
		t.Fatalf("transform-response status=%d body=%v", tr.StatusCode, trBody)
	}
	if trBody["path_suffix"] != "/messages" {
		t.Fatalf("path_suffix mismatch: %+v", trBody)
	}
}

func TestPassthroughForwardingSameIngressEgressOpenAIChat(t *testing.T) {
	var upstreamBody []byte
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected upstream path %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-up-test" {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"stub","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"stub reply"}}]}`))
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.OpenAIChat,
			BaseURL:  base,
			APIKey:   "sk-up-test",
			Model:    "gpt-ignored",
			Models: []profile.Model{{
				ID:       "stub-model-id",
				Model:    "gpt-4o-wire",
				APIStyle: apistyle.OpenAIChat,
			}},
		}},
	}
	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"gpt-4o-wire","messages":[{"role":"user","content":"ping"}],"stream":false}`
	resp, err := http.Post(ts.URL+"/custom/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("expected SSE downstream, ct=%s", resp.Header.Get("Content-Type"))
	}
	if !strings.Contains(string(body), "stub reply") {
		t.Fatalf("unexpected client body %s", body)
	}
	var upstreamParsed map[string]any
	if err := json.Unmarshal(upstreamBody, &upstreamParsed); err != nil {
		t.Fatalf("upstream body not JSON: %s", upstreamBody)
	}
	if upstreamParsed["stream"] != true {
		t.Fatalf("upstream stream = %v want true", upstreamParsed["stream"])
	}
	if !strings.Contains(string(upstreamBody), `"model":"gpt-4o-wire"`) {
		t.Fatalf("upstream did not receive enriched model payload: %s", upstreamBody)
	}
}

func wireClaudeUpstreamStore(base string) *profile.Store {
	return &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.Claude,
			BaseURL:  base,
			APIKey:   "sk-ant-local-wire",
			Model:    "claude-wire",
			Models: []profile.Model{{
				ID:       "cross-model-id",
				Model:    "claude-wire",
				APIStyle: apistyle.Claude,
			}},
		}},
	}
}

func wireResponsesUpstreamStore(base string) *profile.Store {
	return &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.OpenAIResponses,
			BaseURL:  base,
			APIKey:   "sk-test",
			Model:    "gpt-parent",
			Models: []profile.Model{{
				ID:       "cross-model-id",
				Model:    "gpt-wire",
				APIStyle: apistyle.OpenAIResponses,
			}},
		}},
	}
}

func TestSameProtocolOpenAIResponsesSSEPassthroughPreservesLifecycle(t *testing.T) {
	upstreamBody := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"id":"resp_test","object":"response","model":"gpt-wire","status":"in_progress","output":[]},"sequence_number":0}`,
		``,
		`event: response.reasoning_summary_text.delta`,
		`data: {"type":"response.reasoning_summary_text.delta","delta":"thinking","sequence_number":1}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","response":{"id":"resp_test","object":"response","model":"gpt-wire","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1}},"sequence_number":2}`,
		``,
	}, "\n")

	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Errorf("unexpected upstream path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		_, _ = w.Write([]byte(upstreamBody))
	}))
	defer up.Close()

	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
	s.ProfileLoader = func() (*profile.Store, error) { return wireResponsesUpstreamStore(up.URL + "/v1"), nil }
	ts := httptest.NewServer(s.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","input":"ping","stream":true}`
	resp, err := http.Post(ts.URL+"/custom/cross-model-id/openai-responses/v1/responses", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
	raw := string(body)
	for _, want := range []string{
		`event: response.reasoning_summary_text.delta`,
		`"type":"response.reasoning_summary_text.delta"`,
		`event: response.completed`,
		`"type":"response.completed"`,
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("same-protocol Responses stream lost %s in %s", want, raw)
		}
	}
}
func TestCrossProtocolOpenAIIngressWithClaudeUpstreamTranscodesJSON(t *testing.T) {
	var upstreamHits int
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits++
		if r.URL.Path != "/v1/messages" {
			t.Errorf("unexpected upstream path %q", r.URL.Path)
		}
		body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if !strings.Contains(string(body), `"messages"`) {
			t.Fatalf("upstream body missing messages: %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
		  "type": "message",
		  "role": "assistant",
		  "model": "claude-wire",
		  "content": [{"type": "text", "text": "pong"}],
		  "stop_reason": "end_turn"
		}`))
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := wireClaudeUpstreamStore(base)

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":false}`
	resp, err := http.Post(ts.URL+"/custom/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("expected SSE downstream, ct=%s", resp.Header.Get("Content-Type"))
	}
	if !strings.Contains(string(raw), "pong") {
		t.Fatalf("unexpected body %s", raw)
	}
	if upstreamHits != 1 {
		t.Fatalf("upstreamHits=%d", upstreamHits)
	}
}

func TestProxyRouteFailoverRetriesNextBackendOn429(t *testing.T) {
	var firstHits int
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		firstHits++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"rate limited"}`))
	}))
	defer first.Close()

	var secondHits int
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secondHits++
		if r.URL.Path != "/v1/responses" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if !strings.Contains(string(body), `"model":"gpt-wire-backup"`) {
			t.Fatalf("backup upstream model not applied: %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"resp_ok","object":"response","model":"gpt-wire-backup","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"backup ok"}]}]}`))
	}))
	defer second.Close()

	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:         profile.CustomAPIProfileName,
			Kind:         "api",
			ModelAdapter: "manual",
			Models: []profile.Model{
				{
					ID:       "gpt-shared",
					Model:    "gpt-wire-primary",
					APIStyle: apistyle.OpenAIResponses,
					BaseURL:  first.URL + "/v1",
					APIKey:   "sk-primary",
				},
				{
					ID:       "gpt-shared",
					Model:    "gpt-wire-backup",
					APIStyle: apistyle.OpenAIResponses,
					BaseURL:  second.URL + "/v1",
					APIKey:   "sk-backup",
				},
			},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.CallLogs = openTestCallLogStore(t)
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"gpt-shared","input":"ping","stream":false}`
	resp, err := http.Post(ts.URL+"/custom/gpt-shared/openai-responses/v1/responses", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	if firstHits != 1 || secondHits != 1 {
		t.Fatalf("hits first=%d second=%d", firstHits, secondHits)
	}
	if !strings.Contains(string(raw), "backup ok") {
		t.Fatalf("expected backup response, got %s", raw)
	}
	entries := core.CallLogs.ListRecent(1)
	if len(entries) != 1 || entries[0].Route == nil {
		t.Fatalf("missing route log: %+v", entries)
	}
	if entries[0].Route.AttemptCount != 2 || len(entries[0].Route.AttemptBackends) != 2 {
		t.Fatalf("route attempts = %+v", entries[0].Route)
	}
	if entries[0].Route.UpstreamModel != "gpt-wire-backup" {
		t.Fatalf("route upstream model = %q", entries[0].Route.UpstreamModel)
	}
}

func TestCrossProtocolIngressDecompressesGzipUpstream(t *testing.T) {
	payloadJSON := []byte(`{
	  "type": "message",
	  "role": "assistant",
	  "model": "claude-wire",
	  "content": [{"type": "text", "text": "pong"}],
	  "stop_reason": "end_turn"
	}`)
	var gzBuf bytes.Buffer
	gzw := gzip.NewWriter(&gzBuf)
	if _, err := gzw.Write(payloadJSON); err != nil {
		t.Fatal(err)
	}
	if err := gzw.Close(); err != nil {
		t.Fatal(err)
	}
	gzPayload := gzBuf.Bytes()

	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Length", strconv.Itoa(len(gzPayload)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(gzPayload)
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := wireClaudeUpstreamStore(base)

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":false}`
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/custom/cross-model-id/openai-chat/v1/chat/completions", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("expected SSE downstream, ct=%s", resp.Header.Get("Content-Type"))
	}
	if !strings.Contains(string(body), "pong") {
		t.Fatalf("unexpected assistant body %s", body)
	}
}

func TestCrossProtocolSSEUpstreamTranscodedForOpenAIChatIngress(t *testing.T) {
	sseReply := strings.Join([]string{
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"Chat title"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed"}`,
		``,
	}, "\n")
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sseReply))
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := wireResponsesUpstreamStore(base)

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"title this chat"}],"stream":false}`
	resp, err := http.Post(ts.URL+"/custom/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("expected SSE downstream, ct=%s", resp.Header.Get("Content-Type"))
	}
	if !strings.Contains(string(body), "Chat title") {
		t.Fatalf("unexpected SSE body %s", body)
	}
}

func TestIngressStreamWithDefaultsHitsUpstreamConnRefused(t *testing.T) {
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.Claude,
			BaseURL:  "http://127.0.0.1:9",
			APIKey:   "sk-ant-local-wire",
			Model:    "claude-wire",
			Models: []profile.Model{{
				ID:       "noop",
				Model:    "claude-wire",
				APIStyle: apistyle.Claude,
			}},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"noop","messages":[{"role":"user","content":"ping"}]}`
	resp, err := http.Post(ts.URL+"/custom/noop/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("expected upstream failure BadGateway, status=%d body=%s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "upstream request failed") {
		t.Fatalf("unexpected body=%s", body)
	}
}

func TestStreamOpenAIChatIngressViaClaudeUpstreamSSE(t *testing.T) {
	var upstreamBody []byte
	sseReply := strings.Join([]string{
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"pong"}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != "/v1/messages" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sseReply)
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := wireClaudeUpstreamStore(base)

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("want event-stream downstream, ct=%s", resp.Header.Get("Content-Type"))
	}
	bodyStr := string(raw)
	if !strings.Contains(bodyStr, `"object":"chat.completion.chunk"`) || !strings.Contains(bodyStr, `[DONE]`) {
		t.Fatalf("unexpected sse body:\n%s", bodyStr)
	}
	if !strings.Contains(string(upstreamBody), `"stream":true`) {
		t.Fatalf("upstream should receive streaming request: %s", upstreamBody)
	}
}

func TestStreamClaudeIngressViaOpenAIResponsesUpstreamSSE(t *testing.T) {
	var upstreamBody []byte
	sseReply := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"model":"gpt-wire"}}`,
		``,
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"downstream-copy"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed"}`,
		``,
	}, "\n")
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != "/v1/responses" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sseReply)
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.OpenAIResponses,
			BaseURL:  base,
			APIKey:   "sk-test",
			Model:    "gpt-parent",
			Models: []profile.Model{{
				ID:       "responses-edge",
				Model:    "gpt-wire",
				APIStyle: apistyle.OpenAIResponses,
			}},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"responses-edge","max_tokens":512,"messages":[{"role":"user","content":"浣犲ソ"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom/responses-edge/claude/v1/messages", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("want event-stream, ct=%s", resp.Header.Get("Content-Type"))
	}
	bodyStr := string(raw)
	if !strings.Contains(bodyStr, "event: message_start") || !strings.Contains(bodyStr, `content_block_delta`) {
		t.Fatalf("expected claude sse markers:\n%s", bodyStr)
	}
	if !strings.Contains(bodyStr, "downstream-copy") || !strings.Contains(bodyStr, "event: message_stop") {
		t.Fatalf("expected transcoded deltas:\n%s", bodyStr)
	}
	if !strings.Contains(string(upstreamBody), `"stream":true`) {
		t.Fatalf("upstream Responses body missing stream:true: %s", upstreamBody)
	}
}

func TestStreamOpenAIChatIngressViaResponsesUpstreamSSEWithoutContentType(t *testing.T) {
	var upstreamBody []byte
	sseReply := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"model":"gpt-wire"}}`,
		``,
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"codex-style"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed"}`,
		``,
	}, "\n")
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != "/codex/responses" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sseReply)
	}))
	defer up.Close()

	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			BaseURL:                strings.TrimRight(up.URL, "/"),
			APIKey:                 "oauth-token",
			AccountID:              "test-acct",
			Model:                  "gpt-5.4",
			Models: []profile.Model{{
				ID:       "gpt-5.4",
				Model:    "gpt-5.4",
				APIStyle: apistyle.OpenAIResponses,
				BaseURL:  strings.TrimRight(up.URL, "/"),
				APIKey:   "oauth-token",
			}},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"gpt-5.4","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/codex/gpt-5.4/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s upstream=%q", resp.StatusCode, raw, upstreamBody)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("want event-stream downstream, ct=%s body=%s upstream=%q", resp.Header.Get("Content-Type"), raw, upstreamBody)
	}
	bodyStr := string(raw)
	if strings.Contains(bodyStr, "decode_failed") {
		t.Fatalf("unexpected decode failure:\n%s", bodyStr)
	}
	if !strings.Contains(bodyStr, `"object":"chat.completion.chunk"`) || !strings.Contains(bodyStr, "codex-style") {
		t.Fatalf("unexpected sse body:\n%s", bodyStr)
	}
	if !strings.Contains(string(upstreamBody), `"stream":true`) {
		t.Fatalf("upstream should receive streaming request: %s", upstreamBody)
	}
}

func TestStreamOpenAIChatIngressViaClaudeUpstreamGzipSSE(t *testing.T) {
	var upstreamBody []byte
	sseReply := strings.Join([]string{
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"pong"}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")
	var gzBuf bytes.Buffer
	gzw := gzip.NewWriter(&gzBuf)
	if _, err := gzw.Write([]byte(sseReply)); err != nil {
		t.Fatal(err)
	}
	if err := gzw.Close(); err != nil {
		t.Fatal(err)
	}
	gzPayload := gzBuf.Bytes()

	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != "/v1/messages" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Content-Encoding", "gzip")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(gzPayload)
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := wireClaudeUpstreamStore(base)

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	if ce := strings.TrimSpace(resp.Header.Get("Content-Encoding")); ce != "" {
		t.Fatalf("downstream Content-Encoding stripped: got %q", ce)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("want event-stream, ct=%s", resp.Header.Get("Content-Type"))
	}
	bodyStr := string(raw)
	if !strings.Contains(bodyStr, `"object":"chat.completion.chunk"`) || !strings.Contains(bodyStr, `[DONE]`) || !strings.Contains(bodyStr, "pong") {
		t.Fatalf("unexpected transcoded sse body:\n%s", bodyStr)
	}
	if !strings.Contains(string(upstreamBody), `"stream":true`) {
		t.Fatalf("upstream should receive streaming request: %s", upstreamBody)
	}
}

func wireOpenAIChatUpstreamStore(base string) *profile.Store {
	return &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:     provider.CustomAPIVendorName,
			Kind:     "api",
			APIStyle: apistyle.OpenAIChat,
			BaseURL:  base,
			APIKey:   "sk-up-test",
			Model:    "gpt-wire",
			Models: []profile.Model{{
				ID:       "same-chat-model-id",
				Model:    "gpt-4o-wire",
				APIStyle: apistyle.OpenAIChat,
			}},
		}},
	}
}

func TestStreamSameOpenAIChatIngressUpstreamSSENormalized(t *testing.T) {
	const poisonID = `upstream-wire-id-exclusive-for-passthru-detection`
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		sseReply := strings.Join([]string{
			`data: {"id":"` + poisonID + `","object":"chat.completion.chunk","model":"m-wire","choices":[{"index":0,"delta":{"role":"assistant"}}]}`,
			``,
			`data: {"id":"` + poisonID + `","object":"chat.completion.chunk","model":"m-wire","choices":[{"index":0,"delta":{"content":"norm"}}]}`,
			``,
			`data: {"id":"` + poisonID + `","object":"chat.completion.chunk","model":"m-wire","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
			``,
			`data: [DONE]`,
			``,
		}, "\n")
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sseReply)
	}))
	defer up.Close()

	base := strings.TrimRight(up.URL, "/") + "/v1"
	store := wireOpenAIChatUpstreamStore(base)

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"same-chat-model-id","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom/same-chat-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	bodyStr := string(raw)
	if strings.Contains(bodyStr, poisonID) {
		t.Fatalf("expected IR round-trip SSE encoding, upstream id leaked: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, `"id":"chatcmpl-proxy"`) {
		t.Fatalf("proxy encoder must emit deterministic chunk ids: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, "norm") || !strings.Contains(bodyStr, `[DONE]`) {
		t.Fatalf("expected transcoded content and [DONE]: %s", bodyStr)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("want event-stream, ct=%s", resp.Header.Get("Content-Type"))
	}
}

func TestStreamSameOpenAIResponsesIngressUpstreamSSEExtensionRelay(t *testing.T) {
	const poisonMarker = `upstream-responses-id-exclusive-for-extension-relay`
	sseReply := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"id":"` + poisonMarker + `","model":"gpt-5.4"}}`,
		``,
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"passthrough-ok"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed"}`,
		``,
	}, "\n")
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/codex/responses" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sseReply)
	}))
	defer up.Close()

	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			BaseURL:                strings.TrimRight(up.URL, "/"),
			APIKey:                 "oauth-token",
			AccountID:              "test-acct",
			Model:                  "gpt-5.4",
			Models: []profile.Model{{
				ID:       "gpt-5.4",
				Model:    "gpt-5.4",
				APIStyle: apistyle.OpenAIResponses,
				BaseURL:  strings.TrimRight(up.URL, "/"),
				APIKey:   "oauth-token",
			}},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"gpt-5.4","input":"ping","stream":true}`
	resp, err := http.Post(ts.URL+"/codex/gpt-5.4/openai-responses/v1/responses", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, raw)
	}
	bodyStr := string(raw)
	if !strings.Contains(bodyStr, poisonMarker) {
		t.Fatalf("expected extension SSE relay, marker missing:\n%s", bodyStr)
	}
	if !strings.Contains(bodyStr, "event: response.created") || !strings.Contains(bodyStr, "passthrough-ok") {
		t.Fatalf("expected full responses SSE sequence:\n%s", bodyStr)
	}
	createdIdx := strings.Index(bodyStr, "event: response.created")
	deltaIdx := strings.Index(bodyStr, "event: response.output_text.delta")
	if createdIdx < 0 || deltaIdx < 0 || createdIdx > deltaIdx {
		t.Fatalf("response.created must precede output_text.delta:\n%s", bodyStr)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("want event-stream, ct=%s", resp.Header.Get("Content-Type"))
	}
}

func TestKimiCodexSubscriptionClaudeIngressDefaultsStreamTrueWhenOmitted(t *testing.T) {
	var upstreamBody []byte
	sseReply := strings.Join([]string{
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"ok"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","status":"completed"}`,
		``,
	}, "\n")
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamBody, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if r.URL.Path != "/codex/responses" {
			t.Errorf("upstream path=%q", r.URL.Path)
		}
		var parsed map[string]any
		if err := json.Unmarshal(upstreamBody, &parsed); err != nil {
			t.Fatal(err)
		}
		if parsed["stream"] != true {
			t.Fatalf("upstream stream = %v want true", parsed["stream"])
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sseReply)
	}))
	defer up.Close()

	store := &profile.Store{
		Version: profile.StoreVersion,
		List: []profile.Profile{{
			Name:                   provider.CodexVendorName,
			Kind:                   "subscription",
			SubscriptionProviderID: provider.CodexProviderID,
			APIStyle:               apistyle.OpenAIResponses,
			BaseURL:                strings.TrimRight(up.URL, "/"),
			APIKey:                 "oauth-token",
			AccountID:              "test-acct",
			Model:                  "gpt-5.4",
			Models: []profile.Model{{
				ID:       "gpt-5.4",
				Model:    "gpt-5.4",
				APIStyle: apistyle.OpenAIResponses,
				BaseURL:  strings.TrimRight(up.URL, "/"),
				APIKey:   "oauth-token",
			}},
		}},
	}

	core := newTestServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"gpt-5.4","max_tokens":16,"messages":[{"role":"user","content":"."}]}`
	resp, err := http.Post(ts.URL+"/codex/gpt-5.4/claude/v1/messages", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s upstream=%s", resp.StatusCode, raw, upstreamBody)
	}
	if !strings.Contains(string(raw), "content_block_delta") {
		t.Fatalf("expected claude sse downstream:\n%s", raw)
	}
}

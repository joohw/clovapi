package proxy

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestServerHealthAndModelsList(t *testing.T) {
	s := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483})
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
	if !health.OK || health.Service != "clovapi-core-proxy" {
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
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data) != 1 || body.Data[0].ID != "claude-opus-4" {
		t.Fatalf("models body = %+v", body)
	}

	resp, err = http.Get(ts.URL + "/claude-code/claude%20opus%2F4/claude/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("encoded slash models status = %d", resp.StatusCode)
	}
	body = struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data) != 1 || body.Data[0].ID != "claude opus/4" {
		t.Fatalf("encoded slash models body = %+v", body)
	}
}

func TestServerCodexModelsListProxiesOfficialShape(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/backend-api/codex/models" {
			t.Fatalf("upstream path = %q", r.URL.Path)
		}
		if r.URL.Query().Get("client_version") != "0.130.0" {
			t.Fatalf("query = %q", r.URL.RawQuery)
		}
		if got := r.Header.Get("chatgpt-account-id"); got != "acct-test" {
			t.Fatalf("chatgpt-account-id = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"models": []map[string]any{{
				"slug":              "gpt-5.4",
				"display_name":      "gpt-5.4",
				"visibility":        "list",
				"supported_in_api":  true,
				"priority":          1,
				"shell_type":        "shell_command",
				"base_instructions": "test",
			}},
		})
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
			}},
		}},
	}

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/codex/gpt-5.4/openai-responses/v1/models?client_version=0.130.0")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var body struct {
		Models []struct {
			Slug string `json:"slug"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Models) != 1 || body.Models[0].Slug != "gpt-5.4" {
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
	srv := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	srv.ProfileLoader = func() (*profile.Store, error) { return st, nil }
	ts := httptest.NewServer(srv.Server.Handler)
	defer ts.Close()

	resolveURL := ts.URL + "/__debug/resolve-route?provider_id=custom-api&model_id=gpt-demo&ingress_style=openai-chat"
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
		_, _ = w.Write([]byte(`{"upstream":"stub"}`))
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
	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"stub-model-id","messages":[{"role":"user","content":"ping"}],"stream":false}`
	resp, err := http.Post(ts.URL+"/custom-api/stub-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
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
	if !strings.Contains(string(body), `"upstream":"stub"`) {
		t.Fatalf("unexpected client body %s", body)
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":false}`
	resp, err := http.Post(ts.URL+"/custom-api/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
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
	var wire map[string]any
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatal(err)
	}
	choices, ok := wire["choices"].([]any)
	if !ok || len(choices) == 0 {
		t.Fatalf("unexpected body %s", raw)
	}
	msg, ok := choices[0].(map[string]any)["message"].(map[string]any)
	if !ok {
		t.Fatal("assistant message missing")
	}
	if msg["content"] != "pong" {
		t.Fatalf("content=%v", msg["content"])
	}
	if upstreamHits != 1 {
		t.Fatalf("upstreamHits=%d", upstreamHits)
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":false}`
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/custom-api/cross-model-id/openai-chat/v1/chat/completions", strings.NewReader(payload))
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
	if strings.TrimSpace(resp.Header.Get("Content-Encoding")) != "" {
		t.Fatalf("unexpected content-encoding hdr=%v", resp.Header)
	}
	if len(body) > 0 && body[0] == 0x1f {
		t.Fatalf("unexpected gzip sentinel on client body=%v", body[:min(8, len(body))])
	}
	var wire map[string]any
	if err := json.Unmarshal(body, &wire); err != nil {
		t.Fatal(err)
	}
	choices := wire["choices"].([]any)
	msg := choices[0].(map[string]any)["message"].(map[string]any)
	if msg["content"] != "pong" {
		t.Fatalf("unexpected assistant body %v", wire)
	}
}

func TestCrossProtocolSSEUpstreamMaterializedForNonStreamClient(t *testing.T) {
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"title this chat"}],"stream":false}`
	resp, err := http.Post(ts.URL+"/custom-api/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		t.Fatalf("expected JSON downstream, ct=%s", resp.Header.Get("Content-Type"))
	}
	var wire map[string]any
	if err := json.Unmarshal(body, &wire); err != nil {
		t.Fatalf("expected JSON body, got %q: %v", body, err)
	}
	choices, ok := wire["choices"].([]any)
	if !ok || len(choices) == 0 {
		t.Fatalf("missing choices in %#v", wire)
	}
	msg, ok := choices[0].(map[string]any)["message"].(map[string]any)
	if !ok || msg["content"] != "Chat title" {
		t.Fatalf("unexpected assistant body %#v", wire)
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"noop","messages":[{"role":"user","content":"ping"}]}`
	resp, err := http.Post(ts.URL+"/custom-api/noop/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom-api/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"responses-edge","max_tokens":512,"messages":[{"role":"user","content":"你好"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom-api/responses-edge/claude/v1/messages", "application/json", strings.NewReader(payload))
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"cross-model-id","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom-api/cross-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
	core.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(core.Server.Handler)
	defer ts.Close()

	payload := `{"model":"same-chat-model-id","messages":[{"role":"user","content":"ping"}],"stream":true}`
	resp, err := http.Post(ts.URL+"/custom-api/same-chat-model-id/openai-chat/v1/chat/completions", "application/json", strings.NewReader(payload))
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

func TestStreamSameOpenAIResponsesIngressUpstreamSSEPassthrough(t *testing.T) {
	const poisonMarker = `upstream-responses-id-exclusive-for-passthru-detection`
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
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
		t.Fatalf("expected upstream SSE passthrough, marker missing:\n%s", bodyStr)
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

	core := NewServer(profile.ProxyConfig{Host: "127.0.0.1", Port: 0})
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

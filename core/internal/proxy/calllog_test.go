package proxy

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/provider"
	"github.com/google/uuid"
)

func openTestCallLogStore(t *testing.T) *CallLogStore {
	t.Helper()
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestCallLogStorePushAndList(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "GET", URL: "/b"}})
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "DELETE", URL: "/c"}})

	entries := store.ListRecent(0)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	if entries[0].Request.URL != "/c" || entries[1].Request.URL != "/b" {
		t.Fatalf("unexpected order: %#v", entries)
	}
	if entries[0].ID == "" || entries[1].ID == "" {
		t.Fatal("expected ids to be assigned")
	}
	if _, err := uuid.Parse(entries[0].ID); err != nil {
		t.Fatalf("entry id is not a uuid: %q", entries[0].ID)
	}
}

func TestCallLogStoreListRecentPage(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:01Z", Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:02Z", Request: CallLogRequest{Method: "POST", URL: "/b"}})
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:03Z", Request: CallLogRequest{Method: "POST", URL: "/c"}})

	entries := store.ListRecentPage(1, 1)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Request.URL != "/b" {
		t.Fatalf("paged url = %q, want /b", entries[0].Request.URL)
	}
}

func TestShouldRecordCallLog(t *testing.T) {
	if shouldRecordCallLog("/health") {
		t.Fatal("health should be skipped")
	}
	if !shouldRecordCallLog("/vendor/model/openai-chat/v1/chat/completions") {
		t.Fatal("proxy route should be recorded")
	}
	if shouldRecordCallLog("/__debug/call-log") {
		t.Fatal("debug route should be skipped")
	}
}

func TestShouldUseCallLogRoutesProbesToSystemLog(t *testing.T) {
	probe, _ := http.NewRequest(http.MethodHead, "http://127.0.0.1:27483/claude-code/opus/claude", nil)
	ingress, ok := provider.ParseProxyIngressPath(probe.URL.Path)
	if ok {
		t.Fatal("expected invalid ingress path")
	}
	if shouldUseCallLog(probe, ingress, ok) {
		t.Fatal("HEAD probe on invalid path should skip call log")
	}

	models, _ := http.NewRequest(http.MethodGet, "http://127.0.0.1:27483/claude-code/opus/claude/v1/models", nil)
	ingress, ok = provider.ParseProxyIngressPath(models.URL.Path)
	if !ok {
		t.Fatal("expected valid models ingress path")
	}
	if !shouldUseCallLog(models, ingress, ok) {
		t.Fatal("GET models should stay in call log")
	}

	post, _ := http.NewRequest(http.MethodPost, "http://127.0.0.1:27483/claude-code/opus/claude/v1/messages", nil)
	ingress, ok = provider.ParseProxyIngressPath(post.URL.Path)
	if !ok {
		t.Fatal("expected valid messages ingress path")
	}
	if !shouldUseCallLog(post, ingress, ok) {
		t.Fatal("POST messages should stay in call log")
	}

	invalidPost, _ := http.NewRequest(http.MethodPost, "http://127.0.0.1:27483/v1/messages", nil)
	invalidIngress, invalidOK := provider.ParseProxyIngressPath(invalidPost.URL.Path)
	if invalidOK {
		t.Fatal("host-level /v1/messages must not parse as ingress")
	}
	if shouldUseCallLog(invalidPost, invalidIngress, invalidOK) {
		t.Fatal("POST on invalid host-level /v1 path should skip call log")
	}
}

func TestIsHostLevelLegacyV1Path(t *testing.T) {
	if !isHostLevelLegacyV1Path("/v1/messages") {
		t.Fatal("expected host-level /v1/messages")
	}
	if !isHostLevelLegacyV1Path("/v1/chat/completions") {
		t.Fatal("expected host-level /v1/chat/completions")
	}
	if isHostLevelLegacyV1Path("/claude-code/v1/messages") {
		t.Fatal("provider ingress path must not match host-level /v1")
	}
}

func TestCallLogPreservesFullBody(t *testing.T) {
	store := openTestCallLogStore(t)
	trace := startRequestTrace(store, mustHTTPRequest(t))
	if trace == nil {
		t.Fatal("expected trace")
	}
	body := strings.Repeat("x", 32_768)
	trace.setRequestBody([]byte(body))
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"application/json"}}, []byte(body))
	trace.finish()
	entries := store.ListRecent(0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if len(entries[0].Request.Body) != len(body) {
		t.Fatalf("request body len = %d, want %d", len(entries[0].Request.Body), len(body))
	}
	if len(entries[0].Upstream.Body) != len(body) {
		t.Fatalf("upstream body len = %d, want %d", len(entries[0].Upstream.Body), len(body))
	}
}

func TestCallLogSanitizesOpenAIResponsesSSERequestEcho(t *testing.T) {
	store := openTestCallLogStore(t)
	trace := startRequestTrace(store, mustHTTPRequest(t))
	if trace == nil {
		t.Fatal("expected trace")
	}
	body := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"id":"resp_1","object":"response","status":"in_progress","model":"gpt-5.4","instructions":"secret system prompt","tools":[{"name":"Shell"}],"input":[{"role":"user","content":"hello"}],"output":[]}}`,
		``,
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"ok"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","response":{"id":"resp_1","object":"response","status":"completed","model":"gpt-5.4","instructions":"secret system prompt","tools":[{"name":"Shell"}],"input":[{"role":"user","content":"hello"}],"output":[{"type":"message","content":[{"type":"output_text","text":"ok"}]}],"usage":{"input_tokens":1,"output_tokens":1}}}`,
		``,
	}, "\n")
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"text/event-stream"}}, []byte(body))
	trace.finish()

	entries := store.ListRecent(0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	logged := entries[0].Upstream.Body
	for _, forbidden := range []string{"secret system prompt", `"tools"`, `"input"`} {
		if strings.Contains(logged, forbidden) {
			t.Fatalf("call log leaked %s in body:\n%s", forbidden, logged)
		}
	}
	if !strings.Contains(logged, `"delta":"ok"`) || !strings.Contains(logged, `"usage"`) {
		t.Fatalf("call log lost response output fields:\n%s", logged)
	}
}

func TestCallLogExtractsOpenAIResponsesUsage(t *testing.T) {
	body := strings.Join([]string{
		`event: response.completed`,
		`data: {"response":{"completed_at":1780348109,"created_at":1780348103,"error":null,"id":"resp_test","incomplete_details":null,"model":"gpt-5.4","object":"response","output":[],"status":"completed","usage":{"input_tokens":31853,"input_tokens_details":{"cached_tokens":24576},"output_tokens":172,"output_tokens_details":{"reasoning_tokens":7},"total_tokens":32025}},"sequence_number":174,"type":"response.completed"}`,
		``,
	}, "\n")
	usage := ExtractCallLogTokenUsage(body)
	if usage == nil {
		t.Fatal("expected usage")
	}
	if usage.InputTokens != 31853 || usage.OutputTokens != 172 || usage.TotalTokens != 32025 ||
		usage.CacheReadTokens != 24576 || usage.ReasoningTokens != 7 {
		t.Fatalf("usage = %+v", usage)
	}
}

func TestCallLogExtractsToolCallCount(t *testing.T) {
	body := strings.Join([]string{
		`event: response.completed`,
		`data: {"response":{"output":[{"type":"function_call","name":"Shell"},{"type":"function_call","name":"ReadFile"}]},"type":"response.completed"}`,
		``,
	}, "\n")
	if got := ExtractCallLogToolCallCount(body); got != 2 {
		t.Fatalf("tool call count = %d", got)
	}

	anthropic := `{"content":[{"type":"tool_use","name":"Shell"}]}`
	if got := ExtractCallLogToolCallCount(anthropic); got != 1 {
		t.Fatalf("anthropic tool call count = %d", got)
	}
}

func TestCallLogExtractsOpenAIResponsesSSEToolCallOnce(t *testing.T) {
	body := strings.Join([]string{
		`event: response.output_item.added`,
		`data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"Shell"}}`,
		``,
		`event: response.output_item.done`,
		`data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"Shell","arguments":"{}"}}`,
		``,
	}, "\n")
	if got := ExtractCallLogToolCallCount(body); got != 1 {
		t.Fatalf("responses sse tool call count = %d", got)
	}
}

func TestCallLogExtractsClaudeSSEToolCallCount(t *testing.T) {
	body := strings.Join([]string{
		`event: content_block_start`,
		`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"exec_command","input":{}}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}`,
		``,
		`event: content_block_stop`,
		`data: {"type":"content_block_stop","index":1}`,
		``,
	}, "\n")
	if got := ExtractCallLogToolCallCount(body); got != 1 {
		t.Fatalf("claude sse tool call count = %d", got)
	}
}

func TestCallLogExtractsClaudeCodeSSEMetrics(t *testing.T) {
	body := strings.Join([]string{
		`event: message_start`,
		`data: {"type":"message_start","message":{"model":"claude-opus-4-8","id":"msg_1","type":"message","role":"assistant","content":[],"usage":{"input_tokens":2,"cache_creation_input_tokens":56533,"cache_read_input_tokens":0,"output_tokens":47}}}`,
		``,
		`event: content_block_start`,
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}`,
		``,
		`event: content_block_stop`,
		`data: {"type":"content_block_stop","index":0}`,
		``,
		`event: content_block_start`,
		`data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}`,
		``,
		`event: content_block_stop`,
		`data: {"type":"content_block_stop","index":1}`,
		``,
		`event: content_block_start`,
		`data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"WebSearch","input":{},"caller":{"type":"direct"}}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"one\"}"}}`,
		``,
		`event: content_block_stop`,
		`data: {"type":"content_block_stop","index":2}`,
		``,
		`event: content_block_start`,
		`data: {"type":"content_block_start","index":3,"content_block":{"type":"tool_use","id":"toolu_2","name":"WebSearch","input":{},"caller":{"type":"direct"}}}`,
		``,
		`event: content_block_stop`,
		`data: {"type":"content_block_stop","index":3}`,
		``,
		`event: message_delta`,
		`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"input_tokens":2,"cache_creation_input_tokens":56533,"cache_read_input_tokens":0,"output_tokens":316,"output_tokens_details":{"thinking_tokens":86}}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")
	usage := ExtractCallLogTokenUsage(body)
	if usage == nil {
		t.Fatal("expected usage")
	}
	if usage.InputTokens != 2 || usage.OutputTokens != 316 || usage.CacheCreationTokens != 56533 || usage.CacheReadTokens != 0 || usage.ReasoningTokens != 86 {
		t.Fatalf("usage = %+v", usage)
	}
	if got := ExtractCallLogToolCallCount(body); got != 2 {
		t.Fatalf("claudecode tool call count = %d", got)
	}

	store := openTestCallLogStore(t)
	trace := startRequestTrace(store, mustHTTPRequest(t))
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"text/event-stream"}}, []byte(body))
	trace.finish()
	entries := store.ListRecent(0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].ToolCallCount != 2 {
		t.Fatalf("stored tool call count = %d", entries[0].ToolCallCount)
	}
}

func TestCallLogExtractsAnthropicMessagesUsage(t *testing.T) {
	body := strings.Join([]string{
		`event: message_start`,
		`data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet","usage":{"input_tokens":40,"output_tokens":1,"cache_creation_input_tokens":2,"cache_read_input_tokens":3}}}`,
		``,
		`event: message_delta`,
		`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}`,
		``,
	}, "\n")
	usage := ExtractCallLogTokenUsage(body)
	if usage == nil {
		t.Fatal("expected usage")
	}
	if usage.InputTokens != 40 || usage.OutputTokens != 12 || usage.TotalTokens != 52 ||
		usage.CacheCreationTokens != 2 || usage.CacheReadTokens != 3 {
		t.Fatalf("usage = %+v", usage)
	}
}

func TestCallLogClear(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Clear()
	if entries := store.ListRecent(0); len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
}

func TestFindCallLogEntry(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{ID: "entry-1", Request: CallLogRequest{Method: "POST", URL: "/a"}})
	got, err := store.Find("entry-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "entry-1" {
		t.Fatalf("id = %q", got.ID)
	}
}

func TestExportCallLogDB(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{ID: "entry-1", Request: CallLogRequest{Method: "POST", URL: "/a"}})
	outPath := filepath.Join(t.TempDir(), "export.jsonl")
	out, err := os.Create(outPath)
	if err != nil {
		t.Fatal(err)
	}
	n, err := exportCallLogDB(store.db, out)
	out.Close()
	if err != nil || n == 0 {
		t.Fatalf("export n=%d err=%v", n, err)
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "entry-1") {
		t.Fatalf("export missing entry: %q", string(data))
	}
}

func mustHTTPRequest(t *testing.T) *http.Request {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:1/p/a", nil)
	if err != nil {
		t.Fatal(err)
	}
	return req
}

func TestRequestTraceCapturesInboundMetadata(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:27483/codex/gpt-5.4-mini/openai-responses/v1/responses", strings.NewReader(`{"input":"ping"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Host = "127.0.0.1:27483"
	req.Header.Set("Content-Type", "application/json")
	trace := startRequestTrace(openTestCallLogStore(t), req)
	if trace == nil {
		t.Fatal("expected trace")
	}
	if trace.entry.Request.URL != "http://127.0.0.1:27483/codex/gpt-5.4-mini/openai-responses/v1/responses" {
		t.Fatalf("url = %q", trace.entry.Request.URL)
	}
	if trace.entry.Request.Proto != "HTTP/1.1" {
		t.Fatalf("proto = %q", trace.entry.Request.Proto)
	}
	if trace.entry.Request.Headers["Host"] != "127.0.0.1:27483" {
		t.Fatalf("host header = %q", trace.entry.Request.Headers["Host"])
	}
}

func TestRequestTraceRedactsAuthorization(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:1/p/a", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer secret-token")
	trace := startRequestTrace(openTestCallLogStore(t), req)
	if trace == nil {
		t.Fatal("expected trace")
	}
	if got := trace.entry.Request.Headers["Authorization"]; got != "Bearer [redacted]" {
		t.Fatalf("authorization redaction: %q", got)
	}
}

func TestRequestTraceBackfillsUpstreamBodyFromError(t *testing.T) {
	trace := startRequestTrace(openTestCallLogStore(t), mustHTTPRequest(t))
	if trace == nil {
		t.Fatal("expected trace")
	}
	trace.setUpstreamRequest(http.MethodPost, "https://chatgpt.com/backend-api/codex/responses")
	trace.setError(`upstream request failed: Post "https://chatgpt.com/backend-api/codex/responses": EOF`)
	trace.finish()

	entries := trace.store.ListRecent(1)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	entry := entries[0]
	if entry.Upstream.Status != http.StatusBadGateway {
		t.Fatalf("upstream status = %d, want 502", entry.Upstream.Status)
	}
	if !strings.Contains(entry.Upstream.Body, "EOF") {
		t.Fatalf("upstream body = %q", entry.Upstream.Body)
	}
}

func TestRequestTraceCapturesRedactedUpstreamRequestHeaders(t *testing.T) {
	upReq, err := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", strings.NewReader(`{"ping":true}`))
	if err != nil {
		t.Fatal(err)
	}
	upReq.Header.Set("Authorization", "Bearer upstream-token")
	upReq.Header.Set("Anthropic-Beta", "claude-code-20250219")
	upReq.Header.Set("X-Stainless-Lang", "js")

	trace := startRequestTrace(openTestCallLogStore(t), mustHTTPRequest(t))
	if trace == nil {
		t.Fatal("expected trace")
	}
	trace.setUpstreamRequest(upReq.Method, upReq.URL.String())
	trace.setUpstreamRequestHeaders(upReq)
	trace.finish()

	entries := trace.store.ListRecent(1)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	headers := entries[0].Upstream.RequestHeaders
	if headers["Authorization"] != "Bearer [redacted]" {
		t.Fatalf("authorization redaction: %q", headers["Authorization"])
	}
	if headers["Anthropic-Beta"] != "claude-code-20250219" {
		t.Fatalf("anthropic beta = %q", headers["Anthropic-Beta"])
	}
	if headers["Host"] != "api.anthropic.com" {
		t.Fatalf("host = %q", headers["Host"])
	}
	if headers["Content-Length"] == "" {
		t.Fatal("missing content length")
	}
}

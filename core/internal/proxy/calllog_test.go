package proxy

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestCallLogStorePushAndList(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
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
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
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

func TestCallLogPreservesFullBody(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
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

func TestCallLogClear(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Clear()
	if entries := store.ListRecent(0); len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
}

func TestFindCallLogEntry(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
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
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
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
	dir := t.TempDir()
	req, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:27483/codex/gpt-5.4-mini/openai-responses/v1/responses", strings.NewReader(`{"input":"ping"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Host = "127.0.0.1:27483"
	req.Header.Set("Content-Type", "application/json")
	trace := startRequestTrace(newCallLogStoreAt(dir), req)
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
	dir := t.TempDir()
	req, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:1/p/a", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer secret-token")
	trace := startRequestTrace(newCallLogStoreAt(dir), req)
	if trace == nil {
		t.Fatal("expected trace")
	}
	if got := trace.entry.Request.Headers["Authorization"]; got != "Bearer [redacted]" {
		t.Fatalf("authorization redaction: %q", got)
	}
}

func TestRequestTraceCapturesRedactedUpstreamRequestHeaders(t *testing.T) {
	dir := t.TempDir()
	upReq, err := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", strings.NewReader(`{"ping":true}`))
	if err != nil {
		t.Fatal(err)
	}
	upReq.Header.Set("Authorization", "Bearer upstream-token")
	upReq.Header.Set("Anthropic-Beta", "claude-code-20250219")
	upReq.Header.Set("X-Stainless-Lang", "js")

	trace := startRequestTrace(newCallLogStoreAt(dir), mustHTTPRequest(t))
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

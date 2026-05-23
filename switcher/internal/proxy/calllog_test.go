package proxy

import (
	"net/http"
	"testing"
)

func TestCallLogStorePushAndList(t *testing.T) {
	store := NewCallLogStore(2)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "GET", URL: "/b"}})
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "DELETE", URL: "/c"}})

	entries := store.List()
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Request.URL != "/c" || entries[1].Request.URL != "/b" {
		t.Fatalf("unexpected order: %#v", entries)
	}
	if entries[0].ID == "" || entries[1].ID == "" {
		t.Fatal("expected ids to be assigned")
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

func TestRequestTraceRedactsAuthorization(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:1/p/a", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer secret-token")
	trace := startRequestTrace(NewCallLogStore(10), req)
	if trace == nil {
		t.Fatal("expected trace")
	}
	if got := trace.entry.Request.Headers["Authorization"]; got != "Bearer [redacted]" {
		t.Fatalf("authorization redaction: %q", got)
	}
}

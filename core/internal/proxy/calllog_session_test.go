package proxy

import (
	"os"
	"testing"
)

func TestCallLogSessionStoredInSQLite(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{
		Request: CallLogRequest{
			Method: "POST",
			URL:    "/claude-code/opus/claude/v1/messages",
			Headers: map[string]string{
				"X-Claude-Code-Session-Id": "26d82c93-f3dc-41ae-84b6-a967776e193a",
			},
		},
	})

	entries := store.ListRecentSession(0, "26d82c93-f3dc-41ae-84b6-a967776e193a")
	if len(entries) != 1 {
		t.Fatalf("expected 1 session entry, got %d", len(entries))
	}
	if entries[0].Session != "claudecode-26d82c93-f3dc-41ae-84b6-a967776e193a" {
		t.Fatalf("session = %q", entries[0].Session)
	}
	if entries[0].SessionID != "26d82c93-f3dc-41ae-84b6-a967776e193a" {
		t.Fatalf("sessionId = %q", entries[0].SessionID)
	}
	if entries[0].SessionKind != "claudecode" {
		t.Fatalf("sessionKind = %q", entries[0].SessionKind)
	}
}

func TestCallLogCodexSessionStoredInSQLite(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{
		Request: CallLogRequest{
			Method: "POST",
			URL:    "/codex/gpt-5.4/openai-responses/v1/responses",
			Headers: map[string]string{
				"Originator": "codex-tui",
				"Session-Id": "019e64f8-2705-7e43-8413-d2d823f16f50",
			},
		},
	})

	entries := store.ListRecentSession(0, "019e64f8-2705-7e43-8413-d2d823f16f50")
	if len(entries) != 1 {
		t.Fatalf("expected 1 session entry, got %d", len(entries))
	}
	if entries[0].Session != "codex-019e64f8-2705-7e43-8413-d2d823f16f50" {
		t.Fatalf("session = %q", entries[0].Session)
	}
	if entries[0].SessionKind != "codex" {
		t.Fatalf("sessionKind = %q", entries[0].SessionKind)
	}
}

func TestCallLogCodexSessionFallsBackToTurnMetadata(t *testing.T) {
	kind, sessionID := extractCallLogSession(map[string]string{
		"User-Agent":            "codex-tui/0.133.0",
		"X-Codex-Turn-Metadata": `{"session_id":"meta-session","thread_id":"thread","turn_id":"turn"}`,
	})
	if kind != "codex" || sessionID != "meta-session" {
		t.Fatalf("kind=%q sessionID=%q", kind, sessionID)
	}
}

func TestCallLogOpenCodeSessionStoredInSQLite(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{
		Request: CallLogRequest{
			Method: "POST",
			URL:    "/codex/gpt-5.4/openai-responses/v1/responses",
			Headers: map[string]string{
				"User-Agent":         "opencode/1.14.48 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.13",
				"X-Session-Affinity": "ses_19b05f1d2ffed10NNELbSfIL1k",
			},
		},
	})

	entries := store.ListRecentSession(0, "ses_19b05f1d2ffed10NNELbSfIL1k")
	if len(entries) != 1 {
		t.Fatalf("expected 1 session entry, got %d", len(entries))
	}
	if entries[0].Session != "opencode-ses_19b05f1d2ffed10NNELbSfIL1k" {
		t.Fatalf("session = %q", entries[0].Session)
	}
	if entries[0].SessionKind != "opencode" {
		t.Fatalf("sessionKind = %q", entries[0].SessionKind)
	}
}

func TestCallLogWithoutSessionUsesDefaultBucket(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})

	entries := store.ListRecent(0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].SessionID != "" {
		t.Fatalf("sessionId = %q", entries[0].SessionID)
	}
}

func TestCustomAPISameChatModelRequestsUseTestSession(t *testing.T) {
	store := openTestCallLogStore(t)
	url := "http://127.0.0.1:51232/custom-api/same-chat-model-id/openai-chat/v1/chat/completions"
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:01Z", Request: CallLogRequest{Method: "POST", URL: url}})
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:02Z", Request: CallLogRequest{Method: "POST", URL: url}})

	entries := store.ListRecentSession(0, "custom-api-same-chat-model-id-openai-chat")
	if len(entries) != 2 {
		t.Fatalf("expected 2 test session entries, got %d", len(entries))
	}
	if entries[0].Session != "test-custom-api-same-chat-model-id-openai-chat" {
		t.Fatalf("session = %q", entries[0].Session)
	}
	if entries[0].SessionKind != "test" {
		t.Fatalf("sessionKind = %q", entries[0].SessionKind)
	}

	sessions := store.ListSessions(0)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session group, got %d", len(sessions))
	}
	if sessions[0].SessionID != "custom-api-same-chat-model-id-openai-chat" || sessions[0].EntryCount != 2 {
		t.Fatalf("unexpected session summary: %#v", sessions[0])
	}
}

func TestSanitizeSessionFilenameRejectsTraversal(t *testing.T) {
	got := sanitizeSessionFilename("../../etc/passwd")
	if got != "etcpasswd" {
		t.Fatalf("sanitize = %q", got)
	}
}

func TestListCallLogSessions(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{
		StartedAt: "2026-01-01T00:00:01Z",
		Request: CallLogRequest{
			Method:  "POST",
			URL:     "/claude/v1/messages",
			Headers: map[string]string{"X-Claude-Code-Session-Id": "abc-123"},
		},
		Upstream: CallLogUpstream{Body: `{"output":[{"type":"function_call","name":"Shell"}],"usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12}}`},
	})
	store.Push(CallLogEntry{
		StartedAt: "2026-01-01T00:00:02Z",
		Request: CallLogRequest{
			Method:  "POST",
			URL:     "/claude/v1/messages",
			Headers: map[string]string{"X-Claude-Code-Session-Id": "abc-123"},
		},
		Upstream: CallLogUpstream{Body: `{"output":[{"type":"function_call","name":"ReadFile"},{"type":"function_call","name":"Shell"}],"usage":{"input_tokens":5,"output_tokens":3,"total_tokens":8}}`},
	})
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:03Z", Request: CallLogRequest{Method: "POST", URL: "/a"}})

	sessions := store.ListSessions(0)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session group, got %d", len(sessions))
	}
	if sessions[0].Session != "claudecode-abc-123" || sessions[0].SessionID != "abc-123" || sessions[0].SessionKind != "claudecode" || sessions[0].EntryCount != 2 {
		t.Fatalf("unexpected session summary: %#v", sessions[0])
	}
	if len(sessions[0].LogIDs) != 2 {
		t.Fatalf("expected 2 log ids, got %#v", sessions[0].LogIDs)
	}
	if sessions[0].TokenUsage == nil || sessions[0].TokenUsage.InputTokens != 15 || sessions[0].TokenUsage.OutputTokens != 5 || sessions[0].TokenUsage.TotalTokens != 20 {
		t.Fatalf("unexpected session token usage: %#v", sessions[0].TokenUsage)
	}
	if sessions[0].ToolCallCount != 3 {
		t.Fatalf("unexpected session tool call count: %d", sessions[0].ToolCallCount)
	}
}

func TestClearCallLogDB(t *testing.T) {
	store := openTestCallLogStore(t)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Clear()
	if entries := store.ListRecent(0); len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
	if _, err := os.Stat(store.DBPath()); err != nil {
		t.Fatal(err)
	}
}

package proxy

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCallLogSessionStoredInSQLite(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
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
	if entries[0].SessionID != "26d82c93-f3dc-41ae-84b6-a967776e193a" {
		t.Fatalf("sessionId = %q", entries[0].SessionID)
	}
	if entries[0].SessionKind != "claude" {
		t.Fatalf("sessionKind = %q", entries[0].SessionKind)
	}
}

func TestCallLogWithoutSessionUsesDefaultBucket(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})

	entries := store.ListRecent(0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].SessionID != "" {
		t.Fatalf("sessionId = %q", entries[0].SessionID)
	}
}

func TestSanitizeSessionFilenameRejectsTraversal(t *testing.T) {
	got := sanitizeSessionFilename("../../etc/passwd")
	if got != "etcpasswd" {
		t.Fatalf("sanitize = %q", got)
	}
}

func TestImportJSONLIntoSQLite(t *testing.T) {
	dir := t.TempDir()
	jsonlPath := filepath.Join(dir, "default.jsonl")
	if err := appendCallLogEntry(jsonlPath, CallLogEntry{
		ID:        "legacy-1",
		StartedAt: "2026-01-01T00:00:01Z",
		Request:   CallLogRequest{Method: "POST", URL: "/a"},
	}); err != nil {
		t.Fatal(err)
	}

	store := newCallLogStoreAt(dir)
	entries := store.ListRecent(0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 imported entry, got %d", len(entries))
	}
	if entries[0].ID != "legacy-1" {
		t.Fatalf("id = %q", entries[0].ID)
	}
}

func TestListCallLogSessions(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
	store.Push(CallLogEntry{
		StartedAt: "2026-01-01T00:00:01Z",
		Request: CallLogRequest{
			Method:  "POST",
			URL:     "/claude/v1/messages",
			Headers: map[string]string{"X-Claude-Code-Session-Id": "abc-123"},
		},
	})
	store.Push(CallLogEntry{
		StartedAt: "2026-01-01T00:00:02Z",
		Request: CallLogRequest{
			Method:  "POST",
			URL:     "/claude/v1/messages",
			Headers: map[string]string{"X-Claude-Code-Session-Id": "abc-123"},
		},
	})
	store.Push(CallLogEntry{StartedAt: "2026-01-01T00:00:03Z", Request: CallLogRequest{Method: "POST", URL: "/a"}})

	sessions := store.ListSessions(0)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session group, got %d", len(sessions))
	}
	if sessions[0].SessionID != "abc-123" || sessions[0].EntryCount != 2 {
		t.Fatalf("unexpected session summary: %#v", sessions[0])
	}
}

func TestClearCallLogDB(t *testing.T) {
	dir := t.TempDir()
	store := newCallLogStoreAt(dir)
	store.Push(CallLogEntry{Request: CallLogRequest{Method: "POST", URL: "/a"}})
	store.Clear()
	if entries := store.ListRecent(0); len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
	if _, err := os.Stat(filepath.Join(dir, "call-logs.sqlite")); err != nil {
		t.Fatal(err)
	}
}

package proxy

import (
	"path/filepath"
	"regexp"
	"strings"
)

const claudeCodeSessionHeader = "x-claude-code-session-id"

var sessionFilenameSanitizer = regexp.MustCompile(`[^a-zA-Z0-9-]+`)

func extractCallLogSession(headers map[string]string) (kind, sessionID string) {
	for key, val := range headers {
		if !strings.EqualFold(strings.TrimSpace(key), claudeCodeSessionHeader) {
			continue
		}
		id := strings.TrimSpace(val)
		if id == "" {
			return "", ""
		}
		return "claude", id
	}
	return "", ""
}

func sanitizeSessionFilename(sessionID string) string {
	id := strings.TrimSpace(sessionID)
	if id == "" {
		return ""
	}
	id = sessionFilenameSanitizer.ReplaceAllString(id, "")
	if len(id) > 128 {
		id = id[:128]
	}
	return id
}

func callLogPathForEntry(logsDir string, entry CallLogEntry) string {
	kind, sessionID := extractCallLogSession(entry.Request.Headers)
	if kind == "claude" {
		if safe := sanitizeSessionFilename(sessionID); safe != "" {
			return filepath.Join(logsDir, "claude", safe+".jsonl")
		}
	}
	return filepath.Join(logsDir, "default.jsonl")
}

func applyCallLogSessionMeta(entry *CallLogEntry) {
	if entry == nil {
		return
	}
	kind, sessionID := extractCallLogSession(entry.Request.Headers)
	entry.SessionID = sessionID
	entry.SessionKind = kind
}

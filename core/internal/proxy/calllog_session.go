package proxy

import (
	"encoding/json"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
)

const claudeCodeSessionHeader = "x-claude-code-session-id"
const codexSessionHeader = "session-id"
const codexTurnMetadataHeader = "x-codex-turn-metadata"
const openCodeSessionHeader = "x-session-affinity"

var sessionFilenameSanitizer = regexp.MustCompile(`[^a-zA-Z0-9-]+`)

func extractCallLogSession(headers map[string]string) (kind, sessionID string) {
	return extractCallLogSessionForRequest(headers, "")
}

func extractCallLogSessionForRequest(headers map[string]string, requestURL string) (kind, sessionID string) {
	if id := extractHeaderValue(headers, claudeCodeSessionHeader); id != "" {
		return "claudecode", id
	}
	if isOpenCodeRequest(headers) {
		if id := extractHeaderValue(headers, openCodeSessionHeader); id != "" {
			return "opencode", id
		}
	}
	if isCodexRequest(headers) {
		if id := extractHeaderValue(headers, codexSessionHeader); id != "" {
			return "codex", id
		}
		if id := extractCodexMetadataSessionID(extractHeaderValue(headers, codexTurnMetadataHeader)); id != "" {
			return "codex", id
		}
	}
	if id := extractCustomAPITestSessionID(requestURL); id != "" {
		return "test", id
	}
	return "", ""
}

func extractCustomAPITestSessionID(rawURL string) string {
	path := requestPath(rawURL)
	if path == "" {
		return ""
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 4 {
		return ""
	}
	if parts[0] != "custom-api" || parts[2] == "" || parts[3] != "v1" {
		return ""
	}
	if parts[1] != "same-chat-model-id" {
		return ""
	}
	return strings.Join(parts[:3], "-")
}

func requestPath(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err == nil && parsed.Path != "" {
		return parsed.Path
	}
	return rawURL
}

func extractHeaderValue(headers map[string]string, want string) string {
	for key, val := range headers {
		if !strings.EqualFold(strings.TrimSpace(key), want) {
			continue
		}
		return strings.TrimSpace(val)
	}
	return ""
}

func isCodexRequest(headers map[string]string) bool {
	originator := strings.ToLower(extractHeaderValue(headers, "originator"))
	userAgent := strings.ToLower(extractHeaderValue(headers, "user-agent"))
	return strings.Contains(originator, "codex") || strings.Contains(userAgent, "codex")
}

func isOpenCodeRequest(headers map[string]string) bool {
	userAgent := strings.ToLower(extractHeaderValue(headers, "user-agent"))
	return strings.Contains(userAgent, "opencode")
}

func extractCodexMetadataSessionID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var payload struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.SessionID)
}

func callLogSessionKey(kind, sessionID string) string {
	k := strings.TrimSpace(strings.ToLower(kind))
	id := strings.TrimSpace(sessionID)
	if k == "" || id == "" {
		return ""
	}
	return k + "-" + id
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
	kind, sessionID := extractCallLogSessionForRequest(entry.Request.Headers, entry.Request.URL)
	if kind == "claudecode" || kind == "codex" {
		if safe := sanitizeSessionFilename(sessionID); safe != "" {
			return filepath.Join(logsDir, kind, safe+".jsonl")
		}
	}
	return filepath.Join(logsDir, "default.jsonl")
}

func applyCallLogSessionMeta(entry *CallLogEntry) {
	if entry == nil {
		return
	}
	kind, sessionID := extractCallLogSessionForRequest(entry.Request.Headers, entry.Request.URL)
	entry.SessionID = sessionID
	entry.SessionKind = kind
	entry.Session = callLogSessionKey(kind, sessionID)
}

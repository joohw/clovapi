package proxy

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	cfgpkg "github.com/clovapi/switcher/internal/config"
	_ "modernc.org/sqlite"
)

const callLogSchemaSQL = `
CREATE TABLE IF NOT EXISTS call_log_meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS call_logs (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL DEFAULT '',
	session_kind TEXT NOT NULL DEFAULT '',
	started_at TEXT NOT NULL,
	completed_at TEXT NOT NULL DEFAULT '',
	duration_ms INTEGER NOT NULL DEFAULT 0,
	request_json TEXT NOT NULL,
	upstream_json TEXT NOT NULL,
	input_tokens INTEGER NOT NULL DEFAULT 0,
	output_tokens INTEGER NOT NULL DEFAULT 0,
	total_tokens INTEGER NOT NULL DEFAULT 0,
	cache_read_tokens INTEGER NOT NULL DEFAULT 0,
	cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
	reasoning_tokens INTEGER NOT NULL DEFAULT 0,
	tool_call_count INTEGER NOT NULL DEFAULT 0,
	error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON call_logs(started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_session_id ON call_logs(session_id, started_at DESC);
`

// CallLogsDBPath returns the SQLite database path (~/.config/clovapi/logs/call-logs.sqlite).
func CallLogsDBPath() (string, error) {
	return cfgpkg.CallLogsDBPath()
}

func openCallLogDB(dbPath string) (*sql.DB, error) {
	p := strings.TrimSpace(dbPath)
	if p == "" {
		return nil, errors.New("call log db path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return nil, err
	}
	dsn := "file:" + p + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.Exec(callLogSchemaSQL); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := ensureCallLogTokenColumns(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func ensureCallLogTokenColumns(db *sql.DB) error {
	columns := map[string]string{
		"input_tokens":          "INTEGER NOT NULL DEFAULT 0",
		"output_tokens":         "INTEGER NOT NULL DEFAULT 0",
		"total_tokens":          "INTEGER NOT NULL DEFAULT 0",
		"cache_read_tokens":     "INTEGER NOT NULL DEFAULT 0",
		"cache_creation_tokens": "INTEGER NOT NULL DEFAULT 0",
		"reasoning_tokens":      "INTEGER NOT NULL DEFAULT 0",
		"tool_call_count":       "INTEGER NOT NULL DEFAULT 0",
	}
	for name, spec := range columns {
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE call_logs ADD COLUMN %s %s", name, spec)); err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
				return err
			}
		}
	}
	return nil
}

func insertCallLogEntry(db *sql.DB, entry CallLogEntry) error {
	if db == nil {
		return errors.New("call log db is nil")
	}
	applyCallLogSessionMeta(&entry)
	kind, sessionID := entry.SessionKind, entry.SessionID
	reqJSON, err := json.Marshal(entry.Request)
	if err != nil {
		return err
	}
	upJSON, err := json.Marshal(entry.Upstream)
	if err != nil {
		return err
	}
	usage := entry.TokenUsage
	if usage == nil {
		usage = ExtractCallLogTokenUsage(entry.Upstream.Body)
	}
	toolCallCount := entry.ToolCallCount
	if toolCallCount == 0 {
		toolCallCount = ExtractCallLogToolCallCount(entry.Upstream.Body)
	}
	_, err = db.Exec(
		`INSERT OR REPLACE INTO call_logs (
			id, session_id, session_kind, started_at, completed_at, duration_ms,
			request_json, upstream_json,
			input_tokens, output_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
			tool_call_count,
			error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID,
		sessionID,
		kind,
		entry.StartedAt,
		entry.CompletedAt,
		entry.DurationMs,
		string(reqJSON),
		string(upJSON),
		callLogUsageValue(usage, "input"),
		callLogUsageValue(usage, "output"),
		callLogUsageValue(usage, "total"),
		callLogUsageValue(usage, "cache_read"),
		callLogUsageValue(usage, "cache_creation"),
		callLogUsageValue(usage, "reasoning"),
		toolCallCount,
		entry.Error,
	)
	return err
}

func callLogUsageValue(usage *CallLogTokenUsage, key string) int {
	if usage == nil {
		return 0
	}
	switch key {
	case "input":
		return usage.InputTokens
	case "output":
		return usage.OutputTokens
	case "total":
		return usage.TotalTokens
	case "cache_read":
		return usage.CacheReadTokens
	case "cache_creation":
		return usage.CacheCreationTokens
	case "reasoning":
		return usage.ReasoningTokens
	default:
		return 0
	}
}

const callLogEntrySelectColumns = `id, session_id, session_kind, started_at, completed_at, duration_ms,
	request_json, upstream_json,
	input_tokens, output_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
	tool_call_count,
	error`

func scanCallLogEntry(rows *sql.Rows) (CallLogEntry, error) {
	var entry CallLogEntry
	var reqJSON, upJSON string
	usage := CallLogTokenUsage{}
	if err := rows.Scan(
		&entry.ID,
		&entry.SessionID,
		&entry.SessionKind,
		&entry.StartedAt,
		&entry.CompletedAt,
		&entry.DurationMs,
		&reqJSON,
		&upJSON,
		&usage.InputTokens,
		&usage.OutputTokens,
		&usage.TotalTokens,
		&usage.CacheReadTokens,
		&usage.CacheCreationTokens,
		&usage.ReasoningTokens,
		&entry.ToolCallCount,
		&entry.Error,
	); err != nil {
		return CallLogEntry{}, err
	}
	if err := json.Unmarshal([]byte(reqJSON), &entry.Request); err != nil {
		return CallLogEntry{}, err
	}
	if err := json.Unmarshal([]byte(upJSON), &entry.Upstream); err != nil {
		return CallLogEntry{}, err
	}
	if !isZeroCallLogTokenUsage(&usage) {
		entry.TokenUsage = &usage
	}
	entry.Session = callLogSessionKey(entry.SessionKind, entry.SessionID)
	return entry, nil
}

func isZeroCallLogTokenUsage(usage *CallLogTokenUsage) bool {
	return usage == nil || (usage.InputTokens == 0 && usage.OutputTokens == 0 && usage.TotalTokens == 0 && usage.CacheReadTokens == 0 && usage.CacheCreationTokens == 0 && usage.ReasoningTokens == 0)
}

func listCallLogEntries(db *sql.DB, limit int, offset int, sessionID string) ([]CallLogEntry, error) {
	if db == nil {
		return nil, errors.New("call log db is nil")
	}
	if offset < 0 {
		offset = 0
	}
	query := `SELECT ` + callLogEntrySelectColumns + ` FROM call_logs`
	args := []any{}
	if sid := strings.TrimSpace(sessionID); sid != "" {
		query += ` WHERE session_id = ?`
		args = append(args, sid)
	}
	query += ` ORDER BY started_at DESC, id DESC`
	if limit > 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
		if offset > 0 {
			query += ` OFFSET ?`
			args = append(args, offset)
		}
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []CallLogEntry
	for rows.Next() {
		entry, err := scanCallLogEntry(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func findCallLogEntryInDB(db *sql.DB, id string) (CallLogEntry, error) {
	target := strings.TrimSpace(id)
	if target == "" {
		return CallLogEntry{}, errors.New("call log id is empty")
	}
	row := db.QueryRow(
		`SELECT `+callLogEntrySelectColumns+` FROM call_logs WHERE id = ?`,
		target,
	)
	var entry CallLogEntry
	var reqJSON, upJSON string
	usage := CallLogTokenUsage{}
	err := row.Scan(
		&entry.ID,
		&entry.SessionID,
		&entry.SessionKind,
		&entry.StartedAt,
		&entry.CompletedAt,
		&entry.DurationMs,
		&reqJSON,
		&upJSON,
		&usage.InputTokens,
		&usage.OutputTokens,
		&usage.TotalTokens,
		&usage.CacheReadTokens,
		&usage.CacheCreationTokens,
		&usage.ReasoningTokens,
		&entry.ToolCallCount,
		&entry.Error,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return CallLogEntry{}, fmt.Errorf("call log not found: %s", target)
	}
	if err != nil {
		return CallLogEntry{}, err
	}
	if err := json.Unmarshal([]byte(reqJSON), &entry.Request); err != nil {
		return CallLogEntry{}, err
	}
	if err := json.Unmarshal([]byte(upJSON), &entry.Upstream); err != nil {
		return CallLogEntry{}, err
	}
	if !isZeroCallLogTokenUsage(&usage) {
		entry.TokenUsage = &usage
	}
	entry.Session = callLogSessionKey(entry.SessionKind, entry.SessionID)
	return entry, nil
}

func clearCallLogDB(db *sql.DB) error {
	if db == nil {
		return errors.New("call log db is nil")
	}
	if _, err := db.Exec(`DELETE FROM call_logs`); err != nil {
		return err
	}
	return nil
}

func deleteCallLogsBySession(db *sql.DB, kind, sessionID string) (int64, error) {
	if db == nil {
		return 0, errors.New("call log db is nil")
	}
	kind = strings.TrimSpace(strings.ToLower(kind))
	sessionID = strings.TrimSpace(sessionID)
	if kind == "" || sessionID == "" {
		return 0, errors.New("session kind and id are required")
	}
	result, err := db.Exec(
		`DELETE FROM call_logs WHERE session_kind = ? AND session_id = ?`,
		kind,
		sessionID,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func exportCallLogDB(db *sql.DB, w io.Writer) (int, error) {
	if db == nil {
		return 0, errors.New("call log db is nil")
	}
	rows, err := db.Query(
		`SELECT ` + callLogEntrySelectColumns + ` FROM call_logs ORDER BY started_at ASC, id ASC`,
	)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	total := 0
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	for rows.Next() {
		entry, err := scanCallLogEntry(rows)
		if err != nil {
			return total, err
		}
		if err := enc.Encode(entry); err != nil {
			return total, err
		}
		total++
	}
	return total, rows.Err()
}

func listCallLogSessions(db *sql.DB, limit int) ([]CallLogSessionSummary, error) {
	if db == nil {
		return nil, errors.New("call log db is nil")
	}
	query := `SELECT session_id, session_kind, COUNT(*), MIN(started_at), MAX(started_at), GROUP_CONCAT(id, ','),
		SUM(input_tokens), SUM(output_tokens), SUM(total_tokens), SUM(cache_read_tokens), SUM(cache_creation_tokens), SUM(reasoning_tokens), SUM(tool_call_count)
		FROM (
			SELECT id, session_id, session_kind, started_at,
				input_tokens, output_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens, tool_call_count
			FROM call_logs
			WHERE session_id != ''
			ORDER BY started_at DESC, id DESC
		)
		GROUP BY session_id, session_kind
		ORDER BY MAX(started_at) DESC`
	args := []any{}
	if limit > 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CallLogSessionSummary
	for rows.Next() {
		var item CallLogSessionSummary
		var ids string
		usage := CallLogTokenUsage{}
		if err := rows.Scan(
			&item.SessionID,
			&item.SessionKind,
			&item.EntryCount,
			&item.FirstStartedAt,
			&item.LastStartedAt,
			&ids,
			&usage.InputTokens,
			&usage.OutputTokens,
			&usage.TotalTokens,
			&usage.CacheReadTokens,
			&usage.CacheCreationTokens,
			&usage.ReasoningTokens,
			&item.ToolCallCount,
		); err != nil {
			return nil, err
		}
		item.Session = callLogSessionKey(item.SessionKind, item.SessionID)
		item.LogIDs = splitSessionLogIDs(ids)
		if !isZeroCallLogTokenUsage(&usage) {
			item.TokenUsage = &usage
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

type CallLogSessionSummary struct {
	Session        string             `json:"session"`
	SessionID      string             `json:"sessionId"`
	SessionKind    string             `json:"sessionKind"`
	EntryCount     int                `json:"entryCount"`
	FirstStartedAt string             `json:"firstStartedAt"`
	LastStartedAt  string             `json:"lastStartedAt"`
	LogIDs         []string           `json:"logIds"`
	TokenUsage     *CallLogTokenUsage `json:"tokenUsage,omitempty"`
	ToolCallCount  int                `json:"toolCallCount,omitempty"`
}

func splitSessionLogIDs(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if id := strings.TrimSpace(part); id != "" {
			out = append(out, id)
		}
	}
	return out
}

func FindCallLogEntry(id string) (CallLogEntry, error) {
	store := NewCallLogStore()
	if store == nil || store.db == nil {
		return CallLogEntry{}, errors.New("call log store unavailable")
	}
	defer store.Close()
	store.mu.Lock()
	defer store.mu.Unlock()
	return findCallLogEntryInDB(store.db, id)
}

func ExportCallLogs(w io.Writer) (int, error) {
	store := NewCallLogStore()
	if store == nil || store.db == nil {
		return 0, errors.New("call log store unavailable")
	}
	defer store.Close()
	store.mu.Lock()
	defer store.mu.Unlock()
	return exportCallLogDB(store.db, w)
}

package proxy

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
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
	started_at TEXT NOT NULL,
	completed_at TEXT NOT NULL DEFAULT '',
	duration_ms INTEGER NOT NULL DEFAULT 0,
	api_key_json TEXT NOT NULL DEFAULT '',
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
	if err := ensureCallLogColumns(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func ensureCallLogColumns(db *sql.DB) error {
	columns := map[string]string{
		"api_key_json":          "TEXT NOT NULL DEFAULT ''",
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
	reqJSON, err := json.Marshal(entry.Request)
	if err != nil {
		return err
	}
	upJSON, err := json.Marshal(entry.Upstream)
	if err != nil {
		return err
	}
	apiKeyJSON := ""
	if entry.APIKey != nil {
		apiKeyBytes, err := json.Marshal(entry.APIKey)
		if err != nil {
			return err
		}
		apiKeyJSON = string(apiKeyBytes)
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
			id, started_at, completed_at, duration_ms,
			api_key_json, request_json, upstream_json,
			input_tokens, output_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
			tool_call_count,
			error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID,
		entry.StartedAt,
		entry.CompletedAt,
		entry.DurationMs,
		apiKeyJSON,
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

const callLogEntrySelectColumns = `id, started_at, completed_at, duration_ms,
	api_key_json, request_json, upstream_json,
	input_tokens, output_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
	tool_call_count,
	error`

func scanCallLogEntry(rows *sql.Rows) (CallLogEntry, error) {
	var entry CallLogEntry
	var apiKeyJSON, reqJSON, upJSON string
	usage := CallLogTokenUsage{}
	if err := rows.Scan(
		&entry.ID,
		&entry.StartedAt,
		&entry.CompletedAt,
		&entry.DurationMs,
		&apiKeyJSON,
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
	if strings.TrimSpace(apiKeyJSON) != "" {
		apiKey := CallLogAPIKey{}
		if err := json.Unmarshal([]byte(apiKeyJSON), &apiKey); err != nil {
			return CallLogEntry{}, err
		}
		if strings.TrimSpace(apiKey.Label) != "" || strings.TrimSpace(apiKey.Fingerprint) != "" {
			entry.APIKey = &apiKey
		}
	}
	if !isZeroCallLogTokenUsage(&usage) {
		entry.TokenUsage = &usage
	}
	return entry, nil
}

func isZeroCallLogTokenUsage(usage *CallLogTokenUsage) bool {
	return usage == nil || (usage.InputTokens == 0 && usage.OutputTokens == 0 && usage.TotalTokens == 0 && usage.CacheReadTokens == 0 && usage.CacheCreationTokens == 0 && usage.ReasoningTokens == 0)
}

type CallLogAPIKeyAggregate struct {
	APIKey        *CallLogAPIKey `json:"apiKey,omitempty"`
	Count         int            `json:"count"`
	InputTokens   int            `json:"inputTokens,omitempty"`
	OutputTokens  int            `json:"outputTokens,omitempty"`
	TotalTokens   int            `json:"totalTokens,omitempty"`
	ToolCallCount int            `json:"toolCallCount,omitempty"`
	ErrorCount    int            `json:"errorCount,omitempty"`
	LastStartedAt string         `json:"lastStartedAt,omitempty"`
	Unidentified  bool           `json:"unidentified,omitempty"`
}

func listCallLogAPIKeyAggregates(db *sql.DB) ([]CallLogAPIKeyAggregate, error) {
	if db == nil {
		return nil, errors.New("call log db is nil")
	}
	rows, err := db.Query(`SELECT
		api_key_json,
		input_tokens,
		output_tokens,
		total_tokens,
		tool_call_count,
		error,
		started_at
		FROM call_logs
		ORDER BY started_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byKey := map[string]*CallLogAPIKeyAggregate{}
	for rows.Next() {
		var apiKeyJSON, errMsg, startedAt string
		var inputTokens, outputTokens, totalTokens, toolCallCount int
		if err := rows.Scan(
			&apiKeyJSON,
			&inputTokens,
			&outputTokens,
			&totalTokens,
			&toolCallCount,
			&errMsg,
			&startedAt,
		); err != nil {
			return nil, err
		}
		key := "__unidentified__"
		var apiKey *CallLogAPIKey
		if strings.TrimSpace(apiKeyJSON) == "" {
			apiKey = nil
		} else {
			parsed := CallLogAPIKey{}
			if err := json.Unmarshal([]byte(apiKeyJSON), &parsed); err != nil {
				return nil, err
			}
			apiKey = &parsed
			if fingerprint := strings.TrimSpace(parsed.Fingerprint); fingerprint != "" {
				key = fingerprint
			}
		}
		agg, ok := byKey[key]
		if !ok {
			agg = &CallLogAPIKeyAggregate{
				APIKey:        apiKey,
				Unidentified:  key == "__unidentified__",
				LastStartedAt: startedAt,
			}
			byKey[key] = agg
		}
		if agg.APIKey == nil && apiKey != nil {
			agg.APIKey = apiKey
		}
		agg.Count++
		agg.InputTokens += inputTokens
		agg.OutputTokens += outputTokens
		agg.TotalTokens += totalTokens
		agg.ToolCallCount += toolCallCount
		if strings.TrimSpace(errMsg) != "" {
			agg.ErrorCount++
		}
		if startedAt > agg.LastStartedAt {
			agg.LastStartedAt = startedAt
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	aggregates := make([]CallLogAPIKeyAggregate, 0, len(byKey))
	for _, agg := range byKey {
		aggregates = append(aggregates, *agg)
	}
	sort.Slice(aggregates, func(i, j int) bool {
		if aggregates[i].Count != aggregates[j].Count {
			return aggregates[i].Count > aggregates[j].Count
		}
		return aggregates[i].LastStartedAt > aggregates[j].LastStartedAt
	})
	return aggregates, nil
}

func listCallLogEntries(db *sql.DB, limit int, offset int, filter CallLogFilter) ([]CallLogEntry, error) {
	if db == nil {
		return nil, errors.New("call log db is nil")
	}
	if offset < 0 {
		offset = 0
	}
	query := `SELECT ` + callLogEntrySelectColumns + ` FROM call_logs`
	args := []any{}
	where := callLogFilterWhere(filter)
	if where.sql != "" {
		query += ` WHERE ` + where.sql
		args = append(args, where.args...)
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

type callLogSQLFilter struct {
	sql  string
	args []any
}

func callLogFilterWhere(filter CallLogFilter) callLogSQLFilter {
	if filter.APIKeyUnidentified {
		return callLogSQLFilter{sql: `api_key_json = ''`}
	}
	fingerprint := callLogFilterAPIKeyFingerprint(filter)
	if fingerprint == "" {
		return callLogSQLFilter{}
	}
	return callLogSQLFilter{
		sql:  `api_key_json LIKE ?`,
		args: []any{`%"fingerprint":"` + strings.ReplaceAll(fingerprint, `"`, "") + `"%`},
	}
}

func callLogFilterAPIKeyFingerprint(filter CallLogFilter) string {
	if fingerprint := normalizeAPIKeyFingerprint(filter.APIKeyFingerprint); fingerprint != "" {
		return fingerprint
	}
	return apiKeyQueryFingerprint(filter.APIKey)
}

func apiKeyQueryFingerprint(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "#") {
		raw = strings.TrimSpace(strings.TrimPrefix(raw, "#"))
	}
	if strings.HasPrefix(strings.ToLower(raw), "bearer ") {
		raw = strings.TrimSpace(raw[len("bearer "):])
	}
	if fingerprint := normalizeAPIKeyFingerprint(raw); fingerprint != "" {
		return fingerprint
	}
	return apiKeyFingerprint(raw)
}

func normalizeAPIKeyFingerprint(value string) string {
	raw := strings.ToLower(strings.TrimSpace(value))
	if len(raw) < 12 {
		return ""
	}
	for _, ch := range raw {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') {
			return ""
		}
	}
	return raw[:12]
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
	var apiKeyJSON, reqJSON, upJSON string
	usage := CallLogTokenUsage{}
	err := row.Scan(
		&entry.ID,
		&entry.StartedAt,
		&entry.CompletedAt,
		&entry.DurationMs,
		&apiKeyJSON,
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
	if strings.TrimSpace(apiKeyJSON) != "" {
		apiKey := CallLogAPIKey{}
		if err := json.Unmarshal([]byte(apiKeyJSON), &apiKey); err != nil {
			return CallLogEntry{}, err
		}
		if strings.TrimSpace(apiKey.Label) != "" || strings.TrimSpace(apiKey.Fingerprint) != "" {
			entry.APIKey = &apiKey
		}
	}
	if !isZeroCallLogTokenUsage(&usage) {
		entry.TokenUsage = &usage
	}
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

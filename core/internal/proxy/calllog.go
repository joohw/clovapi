package proxy

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/syslog"
	"github.com/google/uuid"
)

type CallLogRequest struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Proto   string            `json:"proto,omitempty"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type CallLogUpstream struct {
	Method         string            `json:"method"`
	URL            string            `json:"url"`
	RequestHeaders map[string]string `json:"requestHeaders,omitempty"`
	Status         int               `json:"status"`
	Headers        map[string]string `json:"headers"`
	Body           string            `json:"body"`
}

type CallLogTokenUsage struct {
	InputTokens         int `json:"inputTokens,omitempty"`
	OutputTokens        int `json:"outputTokens,omitempty"`
	TotalTokens         int `json:"totalTokens,omitempty"`
	CacheReadTokens     int `json:"cacheReadTokens,omitempty"`
	CacheCreationTokens int `json:"cacheCreationTokens,omitempty"`
	ReasoningTokens     int `json:"reasoningTokens,omitempty"`
}

type CallLogEntry struct {
	ID            string             `json:"id"`
	Session       string             `json:"session,omitempty"`
	SessionID     string             `json:"sessionId,omitempty"`
	SessionKind   string             `json:"sessionKind,omitempty"`
	StartedAt     string             `json:"startedAt"`
	CompletedAt   string             `json:"completedAt"`
	DurationMs    int64              `json:"durationMs"`
	Request       CallLogRequest     `json:"request"`
	Upstream      CallLogUpstream    `json:"upstream"`
	TokenUsage    *CallLogTokenUsage `json:"tokenUsage,omitempty"`
	ToolCallCount int                `json:"toolCallCount,omitempty"`
	Error         string             `json:"error,omitempty"`
}

type CallLogStore struct {
	mu     sync.Mutex
	dbPath string
	db     *sql.DB
}

func NewCallLogStore() *CallLogStore {
	dbPath, err := CallLogsDBPath()
	if err != nil {
		return &CallLogStore{}
	}
	db, err := openCallLogDB(dbPath)
	if err != nil {
		return &CallLogStore{dbPath: dbPath}
	}
	return &CallLogStore{dbPath: dbPath, db: db}
}

func newCallLogStoreAt(dir string) *CallLogStore {
	dbPath := filepath.Join(strings.TrimSpace(dir), "call-logs.sqlite")
	db, err := openCallLogDB(dbPath)
	if err != nil {
		return &CallLogStore{dbPath: dbPath}
	}
	return &CallLogStore{dbPath: dbPath, db: db}
}

// Close releases the underlying SQLite handle. Safe to call multiple times and
// on a nil store. Ephemeral stores opened for one-shot reads/exports must close
// to avoid leaking connections (and, on Windows, locking the DB file).
func (s *CallLogStore) Close() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return nil
	}
	err := s.db.Close()
	s.db = nil
	return err
}

func (s *CallLogStore) DBPath() string {
	if s == nil {
		return ""
	}
	return s.dbPath
}

// Path returns the SQLite database path.
func (s *CallLogStore) Path() string {
	return s.DBPath()
}

func (s *CallLogStore) Push(entry CallLogEntry) {
	if s == nil || s.db == nil {
		return
	}
	if strings.TrimSpace(entry.ID) == "" {
		entry.ID = uuid.NewString()
	}
	if strings.TrimSpace(entry.StartedAt) == "" {
		entry.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = insertCallLogEntry(s.db, entry)
}

func (s *CallLogStore) List() []CallLogEntry {
	return s.ListRecent(defaultCallLogUIListMax)
}

func (s *CallLogStore) ListRecent(limit int) []CallLogEntry {
	return s.ListRecentPage(limit, 0)
}

func (s *CallLogStore) ListRecentSession(limit int, sessionID string) []CallLogEntry {
	return s.ListRecentSessionPage(limit, 0, sessionID)
}

func (s *CallLogStore) ListRecentPage(limit int, offset int) []CallLogEntry {
	return s.ListRecentSessionPage(limit, offset, "")
}

func (s *CallLogStore) ListRecentSessionPage(limit int, offset int, sessionID string) []CallLogEntry {
	if s == nil || s.db == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := listCallLogEntries(s.db, limit, offset, sessionID)
	if err != nil {
		return nil
	}
	return entries
}

func (s *CallLogStore) ListSessions(limit int) []CallLogSessionSummary {
	if s == nil || s.db == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out, err := listCallLogSessions(s.db, limit)
	if err != nil {
		return nil
	}
	return out
}

func (s *CallLogStore) Find(id string) (CallLogEntry, error) {
	if s == nil || s.db == nil {
		return CallLogEntry{}, errors.New("call log store unavailable")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return findCallLogEntryInDB(s.db, id)
}

func (s *CallLogStore) Clear() {
	if s == nil || s.db == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = clearCallLogDB(s.db)
}

func shouldRecordCallLog(path string) bool {
	p := strings.TrimSpace(path)
	if p == "" {
		return true
	}
	if p == "/health" {
		return false
	}
	if strings.HasPrefix(p, "/__debug/") {
		return false
	}
	return true
}

func isProbeMethod(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case http.MethodGet, http.MethodHead:
		return true
	default:
		return false
	}
}

// shouldUseCallLog decides whether a request gets a full call-log trace.
// GET/HEAD probes (connectivity checks, invalid paths) go to system logs instead.
func shouldUseCallLog(r *http.Request, ingress provider.Ingress, pathOK bool) bool {
	if r == nil {
		return false
	}
	path := r.URL.EscapedPath()
	if path == "" {
		path = r.URL.Path
	}
	if !shouldRecordCallLog(path) {
		return false
	}
	if !isProbeMethod(r.Method) {
		return true
	}
	return pathOK && isModelsPath(ingress.PathSuffix)
}

func startRequestTraceIfNeeded(store *CallLogStore, r *http.Request, ingress provider.Ingress, pathOK bool) *requestTrace {
	if !shouldUseCallLog(r, ingress, pathOK) {
		return nil
	}
	return startRequestTrace(store, r)
}

func logProxyProbeIfNeeded(r *http.Request, trace *requestTrace, status int, detail string) {
	if trace != nil || r == nil || !isProbeMethod(r.Method) {
		return
	}
	syslog.LogProxyProbe(r.Method, inboundRequestURL(r), status, detail)
}

type requestTrace struct {
	store *CallLogStore
	entry CallLogEntry
	start time.Time
}

func startRequestTrace(store *CallLogStore, r *http.Request) *requestTrace {
	if store == nil || r == nil {
		return nil
	}
	path := r.URL.EscapedPath()
	if path == "" {
		path = r.URL.Path
	}
	if !shouldRecordCallLog(path) {
		return nil
	}
	return &requestTrace{
		store: store,
		start: time.Now().UTC(),
		entry: CallLogEntry{
			StartedAt: time.Now().UTC().Format(time.RFC3339Nano),
			Request: CallLogRequest{
				Method:  r.Method,
				URL:     inboundRequestURL(r),
				Proto:   inboundRequestProto(r),
				Headers: cloneInboundRequestHeaders(r),
			},
		},
	}
}

func inboundRequestURL(r *http.Request) string {
	if r == nil || r.URL == nil {
		return ""
	}
	path := r.URL.EscapedPath()
	if path == "" {
		path = r.URL.Path
	}
	if r.URL.RawQuery != "" {
		path = path + "?" + r.URL.RawQuery
	}
	host := strings.TrimSpace(r.Host)
	if host == "" {
		host = strings.TrimSpace(r.URL.Host)
	}
	if host == "" {
		return path
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + host + path
}

func inboundRequestProto(r *http.Request) string {
	if r == nil {
		return ""
	}
	proto := strings.TrimSpace(r.Proto)
	if proto == "" {
		return "HTTP/1.1"
	}
	return proto
}

func cloneInboundRequestHeaders(r *http.Request) map[string]string {
	if r == nil {
		return map[string]string{}
	}
	out := cloneRedactedHeaders(r.Header)
	host := strings.TrimSpace(r.Host)
	if host == "" {
		return out
	}
	for key := range out {
		if strings.EqualFold(key, "host") {
			return out
		}
	}
	out["Host"] = host
	return out
}

func (t *requestTrace) setRequestBody(body []byte) {
	if t == nil {
		return
	}
	t.entry.Request.Body = redactBodySecrets(body)
}

func (t *requestTrace) setUpstreamRequest(method, url string) {
	if t == nil {
		return
	}
	t.entry.Upstream.Method = strings.TrimSpace(method)
	t.entry.Upstream.URL = strings.TrimSpace(url)
}

func (t *requestTrace) setUpstreamRequestHeaders(r *http.Request) {
	if t == nil || r == nil {
		return
	}
	t.entry.Upstream.RequestHeaders = cloneOutboundRequestHeaders(r)
}

func (t *requestTrace) setUpstreamResponse(status int, headers http.Header, body []byte) {
	if t == nil {
		return
	}
	t.entry.Upstream.Status = status
	t.entry.Upstream.Headers = cloneRedactedHeaders(headers)
	body = sanitizeCallLogUpstreamBody(headers, body)
	t.entry.Upstream.Body = redactBodySecrets(body)
	t.entry.TokenUsage = ExtractCallLogTokenUsage(t.entry.Upstream.Body)
	t.entry.ToolCallCount = ExtractCallLogToolCallCount(t.entry.Upstream.Body)
}

func (t *requestTrace) setError(msg string) {
	if t == nil {
		return
	}
	t.entry.Error = strings.TrimSpace(msg)
}

func (t *requestTrace) finish() {
	if t == nil || t.store == nil {
		return
	}
	now := time.Now().UTC()
	t.entry.CompletedAt = now.Format(time.RFC3339Nano)
	t.entry.DurationMs = now.Sub(t.start).Milliseconds()
	if t.entry.TokenUsage == nil {
		t.entry.TokenUsage = ExtractCallLogTokenUsage(t.entry.Upstream.Body)
	}
	if t.entry.ToolCallCount == 0 {
		t.entry.ToolCallCount = ExtractCallLogToolCallCount(t.entry.Upstream.Body)
	}
	t.store.Push(t.entry)
}

func cloneRedactedHeaders(headers http.Header) map[string]string {
	out := make(map[string]string)
	for key, values := range headers {
		k := strings.ToLower(strings.TrimSpace(key))
		val := strings.Join(values, ", ")
		switch k {
		case "authorization", "x-api-key", "api-key", "x-goog-api-key":
			out[key] = redactHeaderValue(val)
		default:
			out[key] = val
		}
	}
	return out
}

func cloneOutboundRequestHeaders(r *http.Request) map[string]string {
	if r == nil {
		return map[string]string{}
	}
	out := cloneRedactedHeaders(r.Header)
	host := strings.TrimSpace(r.Host)
	if host == "" && r.URL != nil {
		host = strings.TrimSpace(r.URL.Host)
	}
	if host != "" {
		out["Host"] = host
	}
	if r.ContentLength > 0 {
		out["Content-Length"] = strconv.FormatInt(r.ContentLength, 10)
	} else if out["Content-Length"] == "" {
		delete(out, "Content-Length")
	}
	return out
}

// bodySecretKeys are JSON object keys whose values are scrubbed from logged
// request/response bodies. Some clients embed credentials directly in the JSON
// payload (rather than headers), which would otherwise be persisted verbatim
// in the call log and exposed via the debug API.
var bodySecretKeys = map[string]struct{}{
	"api_key":       {},
	"apikey":        {},
	"x-api-key":     {},
	"authorization": {},
	"auth_token":    {},
	"access_token":  {},
	"refresh_token": {},
	"client_secret": {},
	"secret":        {},
	"token":         {},
	"password":      {},
}

// redactBodySecrets returns the body as a string. If the body is JSON and
// contains known secret-bearing keys, those values are replaced with
// "[redacted]"; otherwise the original bytes are preserved verbatim so that
// debugging non-secret payloads remains byte-accurate.
func redactBodySecrets(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return string(body)
	}
	redacted, changed := redactJSONSecrets(parsed)
	if !changed {
		return string(body)
	}
	out, err := json.Marshal(redacted)
	if err != nil {
		return string(body)
	}
	return string(out)
}

func redactJSONSecrets(v any) (any, bool) {
	switch node := v.(type) {
	case map[string]any:
		changed := false
		for key, val := range node {
			if _, secret := bodySecretKeys[strings.ToLower(strings.TrimSpace(key))]; secret {
				if _, isString := val.(string); isString || val != nil {
					node[key] = "[redacted]"
					changed = true
					continue
				}
			}
			if newVal, c := redactJSONSecrets(val); c {
				node[key] = newVal
				changed = true
			}
		}
		return node, changed
	case []any:
		changed := false
		for i, item := range node {
			if newVal, c := redactJSONSecrets(item); c {
				node[i] = newVal
				changed = true
			}
		}
		return node, changed
	default:
		return v, false
	}
}

func sanitizeCallLogUpstreamBody(headers http.Header, body []byte) []byte {
	if len(body) == 0 {
		return body
	}
	if !protocol.UpstreamResponseLooksLikeSSE(headers.Get("Content-Type"), body) {
		return body
	}
	records := parseCallLogSSEResponse(body)
	if len(records) == 0 {
		return body
	}
	var out bytes.Buffer
	changed := false
	for _, rec := range records {
		next, ok := sanitizeOpenAIResponsesSSERecord(rec)
		if ok {
			rec = next
			changed = true
		}
		if strings.TrimSpace(rec.Event) != "" {
			out.WriteString("event: ")
			out.WriteString(rec.Event)
			out.WriteByte('\n')
		}
		if strings.TrimSpace(rec.Data) != "" {
			out.WriteString("data: ")
			out.WriteString(rec.Data)
			out.WriteByte('\n')
		}
		out.WriteByte('\n')
	}
	if !changed {
		return body
	}
	return out.Bytes()
}

func parseCallLogSSEResponse(body []byte) []protocol.SSERecord {
	state := protocol.SSEParseState{}
	records := protocol.AppendParse(body, &state)
	records = append(records, protocol.FlushSSEParseState(&state)...)
	return records
}

func sanitizeOpenAIResponsesSSERecord(rec protocol.SSERecord) (protocol.SSERecord, bool) {
	event := strings.TrimSpace(rec.Event)
	if event == "" {
		var probe map[string]any
		if err := json.Unmarshal([]byte(rec.Data), &probe); err == nil {
			event = strings.TrimSpace(asString(probe["type"]))
		}
	}
	if !strings.HasPrefix(event, "response.") {
		return rec, false
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(rec.Data), &payload); err != nil {
		return rec, false
	}
	next, changed := sanitizeOpenAIResponsesPayload(payload)
	if !changed {
		return rec, false
	}
	raw, err := json.Marshal(next)
	if err != nil {
		return rec, false
	}
	rec.Data = string(raw)
	return rec, true
}

func sanitizeOpenAIResponsesPayload(payload map[string]any) (map[string]any, bool) {
	if payload == nil {
		return payload, false
	}
	out := make(map[string]any, len(payload))
	changed := false
	for key, val := range payload {
		if strings.EqualFold(key, "response") {
			if obj, ok := val.(map[string]any); ok {
				out[key] = sanitizeOpenAIResponseObject(obj)
				changed = true
				continue
			}
		}
		if isOpenAIResponseRequestEchoField(key) {
			changed = true
			continue
		}
		out[key] = val
	}
	return out, changed
}

func sanitizeOpenAIResponseObject(obj map[string]any) map[string]any {
	out := map[string]any{}
	for _, key := range []string{
		"id", "object", "created_at", "status", "completed_at", "error",
		"incomplete_details", "model", "output", "usage",
	} {
		if val, ok := obj[key]; ok {
			out[key] = val
		}
	}
	return out
}

func isOpenAIResponseRequestEchoField(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "input", "instructions", "tools", "tool_choice", "parallel_tool_calls",
		"temperature", "top_p", "max_output_tokens", "max_tokens",
		"metadata", "truncation", "store", "reasoning":
		return true
	default:
		return false
	}
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}

func redactHeaderValue(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(v), "bearer ") {
		return "Bearer [redacted]"
	}
	return "[redacted]"
}

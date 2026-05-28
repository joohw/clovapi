package proxy

import (
	"database/sql"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

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

type CallLogEntry struct {
	ID          string          `json:"id"`
	Session     string          `json:"session,omitempty"`
	SessionID   string          `json:"sessionId,omitempty"`
	SessionKind string          `json:"sessionKind,omitempty"`
	StartedAt   string          `json:"startedAt"`
	CompletedAt string          `json:"completedAt"`
	DurationMs  int64           `json:"durationMs"`
	Request     CallLogRequest  `json:"request"`
	Upstream    CallLogUpstream `json:"upstream"`
	Error       string          `json:"error,omitempty"`
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
	t.entry.Request.Body = string(body)
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
	t.entry.Upstream.Body = string(body)
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

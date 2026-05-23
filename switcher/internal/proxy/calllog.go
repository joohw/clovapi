package proxy

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const defaultCallLogMax = 200

type CallLogRequest struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type CallLogUpstream struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type CallLogEntry struct {
	ID          string           `json:"id"`
	StartedAt   string           `json:"startedAt"`
	CompletedAt string           `json:"completedAt"`
	DurationMs  int64            `json:"durationMs"`
	Request     CallLogRequest   `json:"request"`
	Upstream    CallLogUpstream  `json:"upstream"`
	Error       string           `json:"error,omitempty"`
}

type CallLogStore struct {
	mu      sync.Mutex
	max     int
	nextID  int
	entries []CallLogEntry
}

func NewCallLogStore(max int) *CallLogStore {
	if max <= 0 {
		max = defaultCallLogMax
	}
	return &CallLogStore{max: max}
}

func (s *CallLogStore) Push(entry CallLogEntry) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	entry.ID = fmt.Sprintf("%d", s.nextID)
	s.entries = append([]CallLogEntry{entry}, s.entries...)
	if len(s.entries) > s.max {
		s.entries = s.entries[:s.max]
	}
}

func (s *CallLogStore) List() []CallLogEntry {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]CallLogEntry, len(s.entries))
	copy(out, s.entries)
	return out
}

func (s *CallLogStore) Clear() {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = nil
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
	url := path
	if r.URL.RawQuery != "" {
		url = path + "?" + r.URL.RawQuery
	}
	return &requestTrace{
		store: store,
		start: time.Now().UTC(),
		entry: CallLogEntry{
			StartedAt: time.Now().UTC().Format(time.RFC3339Nano),
			Request: CallLogRequest{
				Method:  r.Method,
				URL:     url,
				Headers: cloneRedactedHeaders(r.Header),
			},
		},
	}
}

func (t *requestTrace) setRequestBody(body []byte) {
	if t == nil {
		return
	}
	t.entry.Request.Body = truncateCallLogText(string(body))
}

func (t *requestTrace) setUpstreamRequest(method, url string) {
	if t == nil {
		return
	}
	t.entry.Upstream.Method = strings.TrimSpace(method)
	t.entry.Upstream.URL = strings.TrimSpace(url)
}

func (t *requestTrace) setUpstreamResponse(status int, headers http.Header, body []byte, streaming bool) {
	if t == nil {
		return
	}
	t.entry.Upstream.Status = status
	t.entry.Upstream.Headers = cloneRedactedHeaders(headers)
	if streaming {
		t.entry.Upstream.Body = "[streaming response]"
		return
	}
	t.entry.Upstream.Body = truncateCallLogText(string(body))
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

func truncateCallLogText(text string) string {
	const max = 8192
	if len(text) <= max {
		return text
	}
	return text[:max] + " …[truncated]"
}

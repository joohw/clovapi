package testclient

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestProbeOpenAIChatPOST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		b, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
		if len(b) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	if err := Probe(apistyle.OpenAIChat, srv.URL, "sk-test", "gpt-4o-mini"); err != nil {
		t.Fatal(err)
	}
}

func TestProbeOpenAIResponsesPOST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if _, ok := body["input"].([]any); !ok {
			http.Error(w, `{"detail":"Input must be a list"}`, http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	if err := Probe(apistyle.OpenAIResponses, srv.URL, "sk-test", "gpt-4o"); err != nil {
		t.Fatal(err)
	}
}

func TestProbeToolRoundTripSendsResponsesAndMessagesWithPongTool(t *testing.T) {
	seen := map[string]bool{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		switch r.URL.Path {
		case "/responses/v1/responses":
			seen["responses"] = true
			if r.Header.Get("Authorization") != "Bearer sk-test" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			input, ok := body["input"].([]any)
			if !ok || len(input) == 0 {
				http.Error(w, `{"detail":"Input must be a list"}`, http.StatusBadRequest)
				return
			}
			if !containsRequestJSON(body, "function_call_output") || !containsRequestJSON(body, "pong") {
				http.Error(w, "missing responses pong tool context", http.StatusBadRequest)
				return
			}
		case "/messages/v1/messages":
			seen["messages"] = true
			if r.Header.Get("x-api-key") != "sk-test" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if !containsRequestJSON(body, "tool_use") || !containsRequestJSON(body, "tool_result") || !containsRequestJSON(body, "pong") {
				http.Error(w, "missing anthropic pong tool context", http.StatusBadRequest)
				return
			}
		default:
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	if err := ProbeToolRoundTrip(srv.URL+"/responses", srv.URL+"/messages", "sk-test", "gpt-5.4"); err != nil {
		t.Fatal(err)
	}
	if !seen["responses"] || !seen["messages"] {
		t.Fatalf("seen = %#v, want both responses and messages", seen)
	}
}

func TestProbeToolRoundTripAttemptsMessagesWhenResponsesFails(t *testing.T) {
	seen := map[string]bool{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/responses/v1/responses":
			seen["responses"] = true
			http.Error(w, `{"error":"boom"}`, http.StatusBadRequest)
		case "/messages/v1/messages":
			seen["messages"] = true
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	err := ProbeToolRoundTrip(srv.URL+"/responses", srv.URL+"/messages", "sk-test", "gpt-5.4")
	if err == nil {
		t.Fatal("expected responses failure")
	}
	if !seen["responses"] || !seen["messages"] {
		t.Fatalf("seen = %#v, want both attempts", seen)
	}
}

func containsRequestJSON(v any, needle string) bool {
	raw, _ := json.Marshal(v)
	return strings.Contains(string(raw), needle)
}

func TestProbeClaudeMessagesPOST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("x-api-key") != "sk-test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if body["stream"] != true {
			http.Error(w, `{"error":{"message":"Stream must be set to true"}}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("event: message_stop\ndata: {}\n\n"))
	}))
	t.Cleanup(srv.Close)

	if err := Probe(apistyle.Claude, srv.URL, "sk-test", "claude-3-5-sonnet-20241022"); err != nil {
		t.Fatal(err)
	}
}

func TestProbeClaudeRequiresStream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["stream"] != true {
			http.Error(w, `{"error":{"message":"Stream must be set to true"}}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("event: ping\ndata: {}\n\n"))
	}))
	t.Cleanup(srv.Close)

	if err := Probe(apistyle.Claude, srv.URL, "sk-test", "gpt-5.4"); err != nil {
		t.Fatal(err)
	}
}

func TestProbeClaudeFallbackWhenMessages404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/anthropic/v1/messages":
			if r.Method != http.MethodPost {
				http.NotFound(w, r)
				return
			}
			http.NotFound(w, r)
		case "/v1/chat/completions":
			if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer sk-test" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	base := srv.URL + "/anthropic"
	if err := Probe(apistyle.Claude, base, "sk-test", "claude-3-5-sonnet-20241022"); err != nil {
		t.Fatal(err)
	}
}

func TestProbeGeminiUsesChatCompletions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	if err := Probe(apistyle.Gemini, srv.URL, "sk-test", "gemini-2.0-flash"); err != nil {
		t.Fatal(err)
	}
}

func TestProbeErrors(t *testing.T) {
	if err := Probe(apistyle.OpenAIChat, "", "k", "m"); err == nil {
		t.Fatal("empty base")
	}
	if err := Probe(apistyle.OpenAIChat, "http://x", "", "m"); err == nil {
		t.Fatal("empty key")
	}
	if err := Probe(apistyle.OpenAIChat, "http://x", "k", ""); err == nil {
		t.Fatal("empty model")
	}
	if err := Probe(apistyle.OpenAIChat, "http://x", "k", "   "); err == nil {
		t.Fatal("whitespace model")
	}
}

func TestReadProbeResponseDrainsSuccessfulBody(t *testing.T) {
	body := &trackingReadCloser{Reader: strings.NewReader(strings.Repeat("x", 8192))}
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Body:       body,
	}
	if err := readProbeResponse(resp); err != nil {
		t.Fatal(err)
	}
	if body.Len() != 0 {
		t.Fatalf("body was not fully drained, remaining=%d", body.Len())
	}
	if !body.closed {
		t.Fatal("body was not closed")
	}
}

type trackingReadCloser struct {
	*strings.Reader
	closed bool
}

func (r *trackingReadCloser) Close() error {
	r.closed = true
	return nil
}

package testclient

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
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
		b, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
		if len(b) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	if err := Probe(apistyle.OpenAIResponses, srv.URL, "sk-test", "gpt-4o"); err != nil {
		t.Fatal(err)
	}
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

package apply

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

type hermesCapturedRequest struct {
	Method string
	Path   string
	Body   []byte
}

type hermesRecorder struct {
	mu   sync.Mutex
	last hermesCapturedRequest
}

func (r *hermesRecorder) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		r.mu.Lock()
		r.last = hermesCapturedRequest{
			Method: req.Method,
			Path:   req.URL.Path,
			Body:   append([]byte(nil), body...),
		}
		r.mu.Unlock()

		switch {
		case strings.Contains(req.URL.Path, "/messages"):
			writeHermesSSE(w, strings.Join([]string{
				`event: message_start`,
				`data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","model":"gpt-5.4","content":[],"usage":{"input_tokens":0,"output_tokens":0}}}`,
				``,
				`event: content_block_start`,
				`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
				``,
				`event: content_block_delta`,
				`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}`,
				``,
				`event: content_block_stop`,
				`data: {"type":"content_block_stop","index":0}`,
				``,
				`event: message_delta`,
				`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}`,
				``,
				`event: message_stop`,
				`data: {"type":"message_stop"}`,
				``,
			}, "\n"))
		case strings.Contains(req.URL.Path, "/responses"):
			writeHermesSSE(w, strings.Join([]string{
				`event: response.created`,
				`data: {"type":"response.created","response":{"id":"resp_test","model":"gpt-5.4"}}`,
				``,
				`event: response.output_text.delta`,
				`data: {"type":"response.output_text.delta","delta":"ok"}`,
				``,
				`event: response.completed`,
				`data: {"type":"response.completed","response":{"id":"resp_test","model":"gpt-5.4","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],"usage":{"input_tokens":5,"output_tokens":3,"total_tokens":8}}}`,
				``,
			}, "\n"))
		default:
			http.NotFound(w, req)
		}
	})
}

func writeHermesSSE(w http.ResponseWriter, payload string) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, payload)
}

func (r *hermesRecorder) snapshot() hermesCapturedRequest {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.last
}

func hermesCLI(t *testing.T) string {
	t.Helper()
	path, err := exec.LookPath("hermes")
	if err != nil {
		t.Skip("hermes CLI not installed; install Hermes Agent to run integration tests")
	}
	return path
}

func hermesTestHome(t *testing.T) (home, hermesHome string) {
	t.Helper()
	home = t.TempDir()
	hermesHome = filepath.Join(home, ".hermes")
	if err := os.MkdirAll(hermesHome, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("HERMES_HOME", hermesHome)
	return home, hermesHome
}

func seedHermesAgentConfig(t *testing.T, hermesHome string) {
	t.Helper()
	cfg := `agent:
  max_turns: 1
approvals:
  mode: auto
hooks:
  auto_accept: true
`
	if err := os.WriteFile(filepath.Join(hermesHome, "config.yaml"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
}

func runHermesQuery(t *testing.T, hermesBin string, query string) {
	runHermesQueryWithExpect(t, hermesBin, query, true)
}

func runHermesQueryWithExpect(t *testing.T, hermesBin string, query string, expectSuccess bool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, hermesBin, "chat",
		"-q", query,
		"-Q",
		"--accept-hooks",
		"--yolo",
		"--max-turns", "1",
		"--ignore-rules",
	)
	cmd.Env = append(os.Environ(),
		"HOME="+os.Getenv("HOME"),
		"HERMES_HOME="+os.Getenv("HERMES_HOME"),
	)
	out, err := cmd.CombinedOutput()
	if expectSuccess && err != nil {
		t.Fatalf("hermes chat failed: %v\n%s", err, out)
	}
}

func TestHermesWireBaseURLAnthropicStripsV1Suffix(t *testing.T) {
	in := "http://127.0.0.1:27483/codex/gpt-5.4/claude/v1"
	want := "http://127.0.0.1:27483/codex/gpt-5.4/claude"
	if got := hermesWireBaseURL(in, "anthropic_messages"); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestHermesCLIAnthropicIngressHitsProxyMessagesPath(t *testing.T) {
	hermesBin := hermesCLI(t)
	_, hermesHome := hermesTestHome(t)
	seedHermesAgentConfig(t, hermesHome)

	rec := &hermesRecorder{}
	srv := httptest.NewServer(rec.handler())
	defer srv.Close()

	ingressBase := strings.TrimSuffix(srv.URL, "/") + "/codex/gpt-5.4/claude"
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.Claude,
		Kind: "subscription", SubscriptionProviderID: provider.CodexProviderID,
		BaseURL: ingressBase, APIKey: "clovapi-local", Model: "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}

	runHermesQuery(t, hermesBin, "你是什么模型")

	got := rec.snapshot()
	if got.Method == "" {
		t.Fatal("hermes did not call the recorder; no HTTP request captured")
	}
	if got.Path != "/codex/gpt-5.4/claude/v1/messages" {
		t.Fatalf("path = %q want /codex/gpt-5.4/claude/v1/messages (Hermes Anthropic SDK must not double /v1)", got.Path)
	}
	var body map[string]any
	if err := json.Unmarshal(got.Body, &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	msgs, ok := body["messages"].([]any)
	if !ok || len(msgs) == 0 {
		t.Fatalf("expected messages[] in Hermes anthropic request, got %#v", body["messages"])
	}
}

func TestHermesCLICodexResponsesIngressIncludesInput(t *testing.T) {
	hermesBin := hermesCLI(t)
	_, hermesHome := hermesTestHome(t)
	seedHermesAgentConfig(t, hermesHome)

	rec := &hermesRecorder{}
	srv := httptest.NewServer(rec.handler())
	defer srv.Close()

	ingressBase := strings.TrimSuffix(srv.URL, "/") + "/codex/gpt-5.4/openai-responses"
	p := profile.Profile{
		Name: "relay", CLI: clikind.Hermes, APIStyle: apistyle.OpenAIResponses,
		BaseURL: ingressBase, APIKey: "clovapi-local", Model: "gpt-5.4",
	}
	if err := Apply(p); err != nil {
		t.Fatal(err)
	}

	runHermesQueryWithExpect(t, hermesBin, "你是什么模型", false)

	got := rec.snapshot()
	if got.Method == "" {
		t.Fatal("hermes did not call the recorder; no HTTP request captured")
	}
	if got.Path != "/codex/gpt-5.4/openai-responses/v1/responses" {
		t.Fatalf("path = %q want /codex/gpt-5.4/openai-responses/v1/responses", got.Path)
	}
	var body map[string]any
	if err := json.Unmarshal(got.Body, &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	inp, ok := body["input"].([]any)
	if !ok || len(inp) == 0 {
		t.Fatalf("Hermes codex_responses must send non-empty input[], got %#v", body["input"])
	}
}

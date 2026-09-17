package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
)

func testState() State {
	return State{Platform: "https://platform.example", Key: "clv_node_secret", NodeID: "node-1", Profile: "saved-api", Model: "test-model", DailyLimit: 2}
}
func fixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := SaveBinding(dir, testState()); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestStateLimitSurvivesRestartRebindAndPause(t *testing.T) {
	dir := fixture(t)
	now := time.Now().UTC()
	if err := reserve(dir, "job-1", now); err != nil {
		t.Fatal(err)
	}
	if err := reserve(dir, "job-1", now); err == nil {
		t.Fatal("duplicate task accepted")
	}
	if err := SetPaused(dir, true); err != nil {
		t.Fatal(err)
	}
	if err := reserve(dir, "job-2", now); err == nil {
		t.Fatal("paused task accepted")
	}
	if err := SetPaused(dir, false); err != nil {
		t.Fatal(err)
	}
	if err := SaveBinding(dir, testState()); err != nil {
		t.Fatal(err)
	}
	if err := reserve(dir, "job-2", now); err != nil {
		t.Fatal(err)
	}
	if err := reserve(dir, "job-3", now); err == nil {
		t.Fatal("restart or rebind reset allowance")
	}
	status, err := Snapshot(dir, now)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(status)
	if bytes.Contains(raw, []byte("clv_node_secret")) {
		t.Fatal("status contains key")
	}
	if status.Used != 2 {
		t.Fatalf("used = %d", status.Used)
	}
	if err := reserve(dir, "job-3", now.Add(24*time.Hour)); err != nil {
		t.Fatal("next UTC day did not reset", err)
	}
}

func TestLocalReservationIsAtomic(t *testing.T) {
	dir := fixture(t)
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if reserve(dir, fmt.Sprintf("job-%d", i), time.Now()) == nil {
				accepted.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if accepted.Load() != 2 {
		t.Fatalf("accepted %d requests past limit2", accepted.Load())
	}
}

func TestRunningWorkerPreventsSecondWorkerAndRebind(t *testing.T) {
	dir := fixture(t)
	unlock, err := acquireLock(filepath.Join(dir, "run.lock"), false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = acquireLock(filepath.Join(dir, "run.lock"), false); err == nil {
		t.Fatal("second process lock accepted")
	}
	if err = SaveBinding(dir, testState()); err == nil {
		t.Fatal("rebind allowed under running worker")
	}
	unlock()
	if err = SaveBinding(dir, testState()); err != nil {
		t.Fatal(err)
	}
}

func TestPlatformOriginValidationAndRedirectNeverForwardsKey(t *testing.T) {
	for _, raw := range []string{"http://example.com", "https://u:secret@example.com", "https://example.com/path", "https://example.com?q=secret", "https://example.com/#fragment", "file:///tmp/node"} {
		if _, err := NormalizePlatform(raw); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	for _, raw := range []string{"https://example.com", "http://localhost:3100", "http://127.0.0.1:3100", "http://[::1]:3100"} {
		if _, err := NormalizePlatform(raw); err != nil {
			t.Errorf("rejected %q: %v", raw, err)
		}
	}
	var forwarded atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded.Store(true) }))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()
	_, err := NewClient(origin.URL, "node-secret").Bind(context.Background(), "test-model")
	if err == nil || forwarded.Load() {
		t.Fatal("redirect followed with node credential")
	}
}

func TestTaskEndpointAndModelArePinned(t *testing.T) {
	s := testState()
	for _, job := range []Job{
		{Path: "/__debug/profiles", Body: json.RawMessage(`{"model":"test-model"}`)},
		{Path: "/v1/chat/completions?url=https://evil", Body: json.RawMessage(`{"model":"test-model"}`)},
		{Path: "https://evil/v1/responses", Body: json.RawMessage(`{"model":"test-model"}`)},
		{Path: "/v1/responses", Body: json.RawMessage(`{"model":"other"}`)},
		{Path: "/v1/responses", Body: json.RawMessage(`null`)},
	} {
		if _, err := validatedBody(s, job); err == nil {
			t.Fatalf("unsafe task accepted: %s", job.Path)
		}
	}
}

func saveUpstream(t *testing.T, url string) {
	t.Helper()
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })
	s := &profile.Store{Version: profile.StoreVersion, List: []profile.Profile{
		{Name: "saved-api", APIStyle: apistyle.OpenAIChat, BaseURL: url + "/v1", APIKey: "upstream-secret", Model: "test-model"},
		{Name: "other-api", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:1", APIKey: "never-used", Model: "test-model"},
	}}
	if err := profile.Save(s); err != nil {
		t.Fatal(err)
	}
}

func TestExecutorUsesOnlySelectedRawCLIProfileAndCancels(t *testing.T) {
	started := make(chan struct{})
	cancelled := make(chan struct{})
	var requests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer upstream-secret" {
			t.Errorf("wrong local route/auth: %s", r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["model"] != "test-model" {
			t.Errorf("upstream model=%v", body["model"])
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"model\":\"test-model\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"}}]}\n\n")
		w.(http.Flusher).Flush()
		close(started)
		<-r.Context().Done()
		close(cancelled)
	}))
	defer upstream.Close()
	saveUpstream(t, upstream.URL)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	job := Job{Path: "/v1/chat/completions", Body: json.RawMessage(`{"model":"test-model","messages":[{"role":"user","content":"hello"}],"stream":true}`)}
	done := make(chan error, 1)
	recorder := httptest.NewRecorder()
	go func() { done <- Execute(ctx, testState(), job, recorder) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("upstream never started")
	}
	cancel()
	select {
	case <-cancelled:
	case <-time.After(3 * time.Second):
		t.Fatal("upstream request did not cancel")
	}
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("executor did not stop")
	}
	if requests.Load() != 1 {
		t.Fatalf("requests = %d", requests.Load())
	}
}

func TestCredentialFileNotWorldReadable(t *testing.T) {
	dir := fixture(t)
	info, err := os.Stat(filepath.Join(dir, "node.json"))
	if err != nil {
		t.Fatal(err)
	}
	// Windows permissions are tested separately through the protected user DACL;
	// chmod's emulated Unix bits do not represent Windows access checks.
	if info.Mode().Perm()&0007 != 0 && os.PathSeparator != '\\' {
		t.Fatalf("credential permissions=%o", info.Mode().Perm())
	}
}

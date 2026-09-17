package relay

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/relaywire"
	"github.com/gorilla/websocket"
)

const fixtureSecret = "relay-test-secret-not-a-real-credential-123456"

type fakeControl struct {
	mu                      sync.Mutex
	connection              string
	used, active, maxActive int
	finished                chan map[string]any
	completeGate            chan struct{}
	completeEntered         chan struct{}
	reserveGate             chan struct{}
	reserveEntered          chan struct{}
	loseReserveReply        bool
	reserveReplyGate        chan struct{}
	reserveCommitted        chan struct{}
}

func (f *fakeControl) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+fixtureSecret {
		w.WriteHeader(401)
		return
	}
	var v map[string]any
	if json.NewDecoder(r.Body).Decode(&v) != nil {
		w.WriteHeader(400)
		return
	}
	action, _ := v["action"].(string)
	if action == "complete" && f.completeGate != nil {
		select {
		case f.completeEntered <- struct{}{}:
		default:
		}
		<-f.completeGate
	}
	if action == "reserve" && f.reserveGate != nil {
		select {
		case f.reserveEntered <- struct{}{}:
		default:
		}
		<-f.reserveGate
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	result := map[string]any{"ok": true, "nodeId": "node-one", "dailyLimit": 100, "used": f.used, "paused": false, "concurrency": 5}
	if action == "consumer" || action == "reserve" {
		if v["consumerKey"] != "consumer-test-key" {
			w.WriteHeader(401)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "unauthorized"})
			return
		}
		result["consumerId"] = "consumer-one"
		result["userId"] = "user-one"
	}
	if action == "connect" || action == "sync" || action == "reserve" {
		if v["nodeKey"] != "node-test-key" {
			w.WriteHeader(401)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "unauthorized"})
			return
		}
	}
	switch action {
	case "connect":
		f.connection = v["connectionId"].(string)
	case "sync":
		result["cancelIds"] = []string{}
	case "reserve":
		if f.active >= 5 {
			w.WriteHeader(503)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "node_busy"})
			return
		}
		f.used++
		f.active++
		if f.active > f.maxActive {
			f.maxActive = f.active
		}
		result["used"] = f.used
		if f.reserveReplyGate != nil {
			select {
			case f.reserveCommitted <- struct{}{}:
			default:
			}
			<-f.reserveReplyGate
		}
		if f.loseReserveReply {
			f.loseReserveReply = false
			connection, _, err := w.(http.Hijacker).Hijack()
			if err == nil {
				_ = connection.Close()
			}
			return
		}
	case "complete":
		f.active--
		f.finished <- v
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

type testNode struct {
	ws     *websocket.Conn
	mu     sync.Mutex
	frames chan relaywire.Message
}

func (n *testNode) send(t *testing.T, m relaywire.Message) {
	t.Helper()
	n.mu.Lock()
	defer n.mu.Unlock()
	if err := n.ws.WriteJSON(m); err != nil {
		t.Fatal(err)
	}
}

func (n *testNode) next(t *testing.T, kind string) relaywire.Message {
	t.Helper()
	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()
	for {
		select {
		case m := <-n.frames:
			if m.Type == kind {
				return m
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %s", kind)
			return relaywire.Message{}
		}
	}
}

func setupRelay(t *testing.T) (*Server, *httptest.Server, *fakeControl, *testNode) {
	t.Helper()
	fake := &fakeControl{finished: make(chan map[string]any, 64)}
	cp := httptest.NewServer(fake)
	s, err := New(Config{ControlPlaneURL: cp.URL, Secret: fixtureSecret})
	if err != nil {
		t.Fatal(err)
	}
	public := httptest.NewServer(s)
	ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(public.URL, "http")+"/api/node/connect", http.Header{"Authorization": []string{"Bearer node-test-key"}})
	if err != nil {
		t.Fatal(err)
	}
	n := &testNode{ws: ws, frames: make(chan relaywire.Message, 512)}
	go func() {
		for {
			var m relaywire.Message
			if ws.ReadJSON(&m) != nil {
				return
			}
			n.frames <- m
		}
	}()
	t.Cleanup(func() { _ = ws.Close(); _ = s.Close(); public.Close(); cp.Close() })
	if m := n.next(t, "welcome"); m.Concurrency != 5 || m.Protocol != 1 {
		t.Fatalf("unexpected welcome: %+v", m)
	}
	n.send(t, relaywire.Message{Type: "hello", Protocol: 1, Models: []string{"model-a", "model-b"}, Remaining: 100, Concurrency: 5})
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		node := s.nodes["node-one"]
		s.mu.Unlock()
		if node != nil {
			node.mu.Lock()
			ready := node.ready
			node.mu.Unlock()
			if ready {
				return s, public, fake, n
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("node did not become ready")
	return nil, nil, nil, nil
}

type httpResult struct {
	status int
	body   []byte
	err    error
}

func TestHealthIsServedWithoutControlPlane(t *testing.T) {
	s, err := New(Config{ControlPlaneURL: "http://127.0.0.1:1", Secret: fixtureSecret})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	recorder := httptest.NewRecorder()
	s.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", recorder.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true || body["service"] != "clovapi-relay" {
		t.Fatalf("unexpected health body: %v", body)
	}
}

func TestInternalEventsCannotUseAnEmptyMigrationSecret(t *testing.T) {
	s, err := New(Config{Controller: controllerFunc(func(context.Context, string, map[string]any) (ControlReply, error) {
		return ControlReply{OK: true}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	recorder := httptest.NewRecorder()
	s.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/internal/events", strings.NewReader(`{"type":"consumer"}`)))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", recorder.Code)
	}
}

type controllerFunc func(context.Context, string, map[string]any) (ControlReply, error)

func (f controllerFunc) Apply(ctx context.Context, action string, payload map[string]any) (ControlReply, error) {
	return f(ctx, action, payload)
}

func consumerRequest(ctx context.Context, base, model string) <-chan httpResult {
	ch := make(chan httpResult, 1)
	go func() {
		req, _ := http.NewRequestWithContext(ctx, "POST", base+"/v1/chat/completions", strings.NewReader(`{"model":"`+model+`","messages":[{"role":"user","content":"hello"}],"stream":true}`))
		req.Header.Set("Authorization", "Bearer consumer-test-key")
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- httpResult{err: err}
			return
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		ch <- httpResult{status: resp.StatusCode, body: body, err: err}
	}()
	return ch
}

func result(t *testing.T, ch <-chan httpResult) httpResult {
	t.Helper()
	select {
	case r := <-ch:
		return r
	case <-time.After(5 * time.Second):
		t.Fatal("HTTP request did not finish")
		return httpResult{}
	}
}

func reply(t *testing.T, n *testNode, id string, data []byte) {
	n.send(t, relaywire.Message{Type: "headers", ID: id, Seq: 0, Status: 200, ContentType: "text/event-stream; charset=utf-8"})
	n.send(t, relaywire.Message{Type: "data", ID: id, Seq: 1, Data: data})
	n.send(t, relaywire.Message{Type: "end", ID: id, Seq: 2})
}

func TestFiveConcurrentRequestsAndSixthHasNoQueue(t *testing.T) {
	_, public, fake, n := setupRelay(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	requests := make([]<-chan httpResult, 5)
	ids := make([]string, 5)
	for i := range requests {
		model := "model-a"
		if i%2 != 0 {
			model = "model-b"
		}
		requests[i] = consumerRequest(ctx, public.URL, model)
		ids[i] = n.next(t, "request").ID
	}
	sixth := result(t, consumerRequest(ctx, public.URL, "model-a"))
	if sixth.status != 503 || !bytes.Contains(sixth.body, []byte("no_node_capacity")) {
		t.Fatalf("sixth request: %+v", sixth)
	}
	stream := []byte("event: delta\ndata: {\"text\":\"你好\"}\n\ndata: [DONE]\n\n")
	for _, id := range ids {
		reply(t, n, id, stream)
	}
	for _, request := range requests {
		got := result(t, request)
		if got.err != nil || got.status != 200 || !bytes.Equal(got.body, stream) {
			t.Fatalf("stream changed: %+v", got)
		}
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if fake.maxActive != 5 || fake.used != 5 {
		t.Fatalf("admissions used=%d max=%d", fake.used, fake.maxActive)
	}
}

func TestConsumerCancellationReachesNodeAndFreesCapacity(t *testing.T) {
	s, public, fake, n := setupRelay(t)
	ctx, cancel := context.WithCancel(context.Background())
	request := consumerRequest(ctx, public.URL, "model-a")
	frame := n.next(t, "request")
	cancel()
	if got := n.next(t, "cancel"); got.ID != frame.ID {
		t.Fatalf("cancelled wrong request %s", got.ID)
	}
	if got := result(t, request); got.err == nil {
		t.Fatal("client cancellation reported success")
	}
	select {
	case entry := <-fake.finished:
		if entry["state"] != "cancelled" {
			t.Fatalf("completion %+v", entry)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("missing completion")
	}
	s.mu.Lock()
	node := s.nodes["node-one"]
	s.mu.Unlock()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		node.mu.Lock()
		released := len(node.jobs) == 0
		node.mu.Unlock()
		if released {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("slot was not released")
}

func TestNodeDisconnectTruncatesResponseWithoutReplay(t *testing.T) {
	_, public, fake, n := setupRelay(t)
	request := consumerRequest(context.Background(), public.URL, "model-a")
	frame := n.next(t, "request")
	n.send(t, relaywire.Message{Type: "headers", ID: frame.ID, Status: 200, ContentType: "text/event-stream"})
	n.send(t, relaywire.Message{Type: "data", ID: frame.ID, Seq: 1, Data: []byte("data: partial\n\n")})
	n.next(t, "ack")
	_ = n.ws.Close()
	got := result(t, request)
	if got.err == nil || got.status != 200 {
		t.Fatalf("truncated response looked successful: %+v", got)
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if fake.used != 1 {
		t.Fatal("request was replayed")
	}
}

func TestAuthenticatedModelsAndPrivatePaths(t *testing.T) {
	_, public, _, _ := setupRelay(t)
	for _, path := range []string{"/v1/models", "/internal/events", "/api/internal/relay", "/api//internal/relay", "/foo/../api/internal/relay"} {
		req, _ := http.NewRequest("GET", public.URL+path, nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 401 && resp.StatusCode != 404 {
			t.Fatalf("private route %s status=%d body=%s", path, resp.StatusCode, data)
		}
		if bytes.Contains(data, []byte(fixtureSecret)) || bytes.Contains(data, []byte("node-test-key")) {
			t.Fatal("response leaked credentials")
		}
	}
	req, _ := http.NewRequest("GET", public.URL+"/v1/models", nil)
	req.Header.Set("Authorization", "Bearer consumer-test-key")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || !bytes.Contains(data, []byte("model-a")) || !bytes.Contains(data, []byte("model-b")) {
		t.Fatalf("models status=%d data=%s", resp.StatusCode, data)
	}
}

func TestResponseFlowControlAndSequenceAreBounded(t *testing.T) {
	for _, test := range []struct {
		name  string
		frame relaywire.Message
		want  string
	}{
		{"sequence", relaywire.Message{Type: "data", ID: "id", Seq: 2, Data: []byte("x")}, "invalid_node_response"},
		{"chunk", relaywire.Message{Type: "data", ID: "id", Seq: 1, Data: make([]byte, relaywire.MaxChunkBytes+1)}, "invalid_node_response"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, public, _, n := setupRelay(t)
			request := consumerRequest(context.Background(), public.URL, "model-a")
			frame := n.next(t, "request")
			n.send(t, relaywire.Message{Type: "headers", ID: frame.ID, Status: 200, ContentType: "application/json"})
			test.frame.ID = frame.ID
			n.send(t, test.frame)
			if got := n.next(t, "cancel"); got.ID != frame.ID {
				t.Fatal("wrong cancellation")
			}
			got := result(t, request)
			if got.err == nil && got.status == 200 {
				t.Fatalf("invalid response accepted %+v", got)
			}
		})
	}
}

type blockedWriter struct {
	header  http.Header
	started chan struct{}
	unblock chan struct{}
	once    sync.Once
}

func (w *blockedWriter) Header() http.Header { return w.header }
func (w *blockedWriter) WriteHeader(int)     {}
func (w *blockedWriter) Flush()              {}
func (w *blockedWriter) Write(data []byte) (int, error) {
	w.once.Do(func() { close(w.started) })
	<-w.unblock
	return len(data), nil
}

func TestSlowConsumerDoesNotBlockAnotherStream(t *testing.T) {
	s, public, _, n := setupRelay(t)
	w := &blockedWriter{header: make(http.Header), started: make(chan struct{}), unblock: make(chan struct{})}
	request := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(`{"model":"model-a"}`))
	request.Header.Set("Authorization", "Bearer consumer-test-key")
	request.Header.Set("Content-Type", "application/json")
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer func() {
			if recovered := recover(); recovered != nil && recovered != http.ErrAbortHandler {
				panic(recovered)
			}
		}()
		s.ServeHTTP(w, request)
	}()
	first := n.next(t, "request")
	n.send(t, relaywire.Message{Type: "headers", ID: first.ID, Status: 200, ContentType: "text/event-stream"})
	n.send(t, relaywire.Message{Type: "data", ID: first.ID, Seq: 1, Data: []byte("x")})
	select {
	case <-w.started:
	case <-time.After(5 * time.Second):
		t.Fatal("slow consumer never started")
	}
	defer func() { close(w.unblock); <-done }()
	// Stay well below the byte window but exceed the bounded frame count.
	for seq := 2; seq < 70; seq++ {
		n.send(t, relaywire.Message{Type: "data", ID: first.ID, Seq: seq, Data: []byte("x")})
	}
	if cancelled := n.next(t, "cancel"); cancelled.ID != first.ID {
		t.Fatal("cancelled the wrong stream")
	}
	second := consumerRequest(context.Background(), public.URL, "model-b")
	frame := n.next(t, "request")
	reply(t, n, frame.ID, []byte("data: works\n\n"))
	got := result(t, second)
	if got.err != nil || string(got.body) != "data: works\n\n" {
		t.Fatalf("second stream blocked: %+v", got)
	}
}

func TestNodeRevocationClosesConnectionAndConsumerRevocationCancelsOnlyItsRequests(t *testing.T) {
	_, public, _, n := setupRelay(t)
	request := consumerRequest(context.Background(), public.URL, "model-a")
	frame := n.next(t, "request")
	sendEvent := func(body string) {
		req, _ := http.NewRequest("POST", public.URL+"/internal/events", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+fixtureSecret)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Fatalf("event returned %d", resp.StatusCode)
		}
	}
	sendEvent(`{"type":"consumer","consumerId":"consumer-one"}`)
	if cancellation := n.next(t, "cancel"); cancellation.ID != frame.ID {
		t.Fatal("wrong request cancelled")
	}
	if got := result(t, request); got.status != 502 {
		t.Fatalf("revoked request still succeeded %+v", got)
	}
	sendEvent(`{"type":"node","nodeId":"node-one","paused":true}`)
	if got := result(t, consumerRequest(context.Background(), public.URL, "model-a")); got.status != 503 {
		t.Fatalf("paused node was dispatched %+v", got)
	}
	sendEvent(`{"type":"node","nodeId":"node-one","disconnect":true}`)
}

func TestProxyPreservesPublicOriginAndRejectsUntrustedForwarding(t *testing.T) {
	for _, trusted := range []bool{false, true} {
		cp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]string{"host": r.Host, "proto": r.Header.Get("X-Forwarded-Proto"), "forwardedHost": r.Header.Get("X-Forwarded-Host"), "origin": r.Header.Get("X-Clovapi-Origin"), "signature": r.Header.Get("X-Clovapi-Origin-Signature")})
		}))
		s, err := New(Config{ControlPlaneURL: cp.URL, Secret: fixtureSecret, TrustProxy: trusted})
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest("GET", "http://public.example/console", nil)
		req.Header.Set("X-Forwarded-Proto", "https")
		req.Header.Set("X-Forwarded-Host", "attacker.example")
		req.Header.Set("X-Clovapi-Origin", "https://attacker.example")
		req.Header.Set("X-Clovapi-Origin-Signature", "forged")
		recorder := httptest.NewRecorder()
		s.ServeHTTP(recorder, req)
		var body map[string]string
		_ = json.Unmarshal(recorder.Body.Bytes(), &body)
		wantProto := "http"
		if trusted {
			wantProto = "https"
		}
		if body["host"] != "public.example" || body["forwardedHost"] != "public.example" || body["proto"] != wantProto {
			t.Fatalf("forwarding trusted=%t: %+v", trusted, body)
		}
		origin := wantProto + "://public.example"
		mac := hmac.New(sha256.New, []byte(fixtureSecret))
		_, _ = mac.Write([]byte(origin))
		signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
		if body["origin"] != origin || body["signature"] != signature {
			t.Fatalf("origin attestation did not override incoming headers: %+v", body)
		}
		s.Close()
		cp.Close()
	}
}

func TestTinySSEBurstUsesPipelinedFrameWindow(t *testing.T) {
	_, public, _, n := setupRelay(t)
	request := consumerRequest(context.Background(), public.URL, "model-a")
	frame := n.next(t, "request")
	n.send(t, relaywire.Message{Type: "headers", ID: frame.ID, Status: 200, ContentType: "text/event-stream"})
	const total = 1024
	for offset := 0; offset < total; offset += relaywire.MaxInflightFrames {
		for index := 0; index < relaywire.MaxInflightFrames; index++ {
			n.send(t, relaywire.Message{Type: "data", ID: frame.ID, Seq: offset + index + 1, Data: []byte("x")})
		}
		for index := 0; index < relaywire.MaxInflightFrames; index++ {
			ack := n.next(t, "ack")
			if ack.Bytes != 1 || ack.ID != frame.ID {
				t.Fatal("invalid frame acknowledgement")
			}
		}
	}
	n.send(t, relaywire.Message{Type: "end", ID: frame.ID, Seq: total + 1})
	got := result(t, request)
	if got.err != nil || got.status != 200 || !bytes.Equal(got.body, bytes.Repeat([]byte("x"), total)) {
		t.Fatalf("tiny SSE burst failed: status=%d bytes=%d error=%v", got.status, len(got.body), got.err)
	}
}

func TestCompletionKeepsSlotUntilDurableReservationIsReleased(t *testing.T) {
	s, public, fake, n := setupRelay(t)
	fake.completeGate = make(chan struct{})
	fake.completeEntered = make(chan struct{}, 1)
	request := consumerRequest(context.Background(), public.URL, "model-a")
	frame := n.next(t, "request")
	reply(t, n, frame.ID, []byte("data: done\n\n"))
	select {
	case <-fake.completeEntered:
	case <-time.After(5 * time.Second):
		t.Fatal("missing completion")
	}
	s.mu.Lock()
	node := s.nodes["node-one"]
	s.mu.Unlock()
	node.mu.Lock()
	held := node.jobs[frame.ID] != nil
	node.mu.Unlock()
	if !held {
		t.Fatal("slot was made available before durable completion")
	}
	select {
	case <-request:
		t.Fatal("consumer returned before completion")
	default:
	}
	close(fake.completeGate)
	if got := result(t, request); got.err != nil || got.status != 200 {
		t.Fatalf("request failed %+v", got)
	}
	next := consumerRequest(context.Background(), public.URL, "model-a")
	nextFrame := n.next(t, "request")
	reply(t, n, nextFrame.ID, []byte("data: again\n\n"))
	if got := result(t, next); got.err != nil || got.status != 200 {
		t.Fatalf("next request was rejected %+v", got)
	}
}

func TestRevokedDuringAdmissionDoesNotDispatchToNode(t *testing.T) {
	_, public, fake, n := setupRelay(t)
	fake.reserveGate = make(chan struct{})
	fake.reserveEntered = make(chan struct{}, 1)
	request := consumerRequest(context.Background(), public.URL, "model-a")
	select {
	case <-fake.reserveEntered:
	case <-time.After(5 * time.Second):
		t.Fatal("request was not reserved")
	}
	req, _ := http.NewRequest("POST", public.URL+"/internal/events", strings.NewReader(`{"type":"consumer","consumerId":"consumer-one"}`))
	req.Header.Set("Authorization", "Bearer "+fixtureSecret)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	close(fake.reserveGate)
	if got := result(t, request); got.status != 502 {
		t.Fatalf("revoked admission status=%d", got.status)
	}
	for {
		select {
		case frame := <-n.frames:
			if frame.Type == "request" {
				t.Fatal("request started after admission cancellation")
			}
		default:
			return
		}
	}
}

func TestMalformedRequestsDoNotConsumeQuota(t *testing.T) {
	_, public, fake, _ := setupRelay(t)
	for _, test := range []struct{ path, body, contentType string }{
		{"/v1/chat/completions", `{"model":"model-a"}`, "text/plain"},
		{"/v1/chat/completions", `{"model":"model-a","stream":"yes"}`, "application/json"},
		{"/v1/chat/completions", `{"model":"model-a","stream":null}`, "application/json"},
		{"/v1/chat/completions", `{"model":"../bad model"}`, "application/json"},
		{"/v1//chat/completions", `{"model":"model-a"}`, "application/json"},
	} {
		req, _ := http.NewRequest("POST", public.URL+test.path, strings.NewReader(test.body))
		req.Header.Set("Content-Type", test.contentType)
		req.Header.Set("Authorization", "Bearer consumer-test-key")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 400 {
			t.Fatalf("malformed request status=%d", resp.StatusCode)
		}
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if fake.used != 0 {
		t.Fatalf("malformed requests consumed %d quota", fake.used)
	}
}

func TestLostReservationReplyIsCompletedBeforeSlotReleaseAndNeverDispatched(t *testing.T) {
	s, public, fake, n := setupRelay(t)
	fake.loseReserveReply = true
	fake.completeGate = make(chan struct{})
	fake.completeEntered = make(chan struct{}, 1)
	request := consumerRequest(context.Background(), public.URL, "model-a")
	select {
	case <-fake.completeEntered:
	case <-time.After(5 * time.Second):
		t.Fatal("ambiguous admission was not completed")
	}
	s.mu.Lock()
	node := s.nodes["node-one"]
	s.mu.Unlock()
	node.mu.Lock()
	held := len(node.jobs) == 1
	node.mu.Unlock()
	if !held {
		t.Fatal("ambiguous admission released its slot before cleanup")
	}
	fake.mu.Lock()
	active := fake.active
	used := fake.used
	fake.mu.Unlock()
	if active != 1 || used != 1 {
		t.Fatalf("fixture did not commit admission: active=%d used=%d", active, used)
	}
	close(fake.completeGate)
	if got := result(t, request); got.status != 503 {
		t.Fatalf("unexpected ambiguous admission response: %+v", got)
	}
	fake.mu.Lock()
	active = fake.active
	fake.mu.Unlock()
	if active != 0 {
		t.Fatal("durable slot leaked after ambiguous admission")
	}
	for draining := true; draining; {
		select {
		case frame := <-n.frames:
			if frame.Type == "request" {
				t.Fatal("ambiguous request dispatched to worker")
			}
		default:
			draining = false
		}
	}
	next := consumerRequest(context.Background(), public.URL, "model-a")
	frame := n.next(t, "request")
	reply(t, n, frame.ID, []byte("data: next\n\n"))
	if got := result(t, next); got.status != 200 || got.err != nil {
		t.Fatalf("next request blocked: %+v", got)
	}
}

func TestConsumerCancellationAfterAdmissionCommitCleansDurableSlot(t *testing.T) {
	_, public, fake, n := setupRelay(t)
	fake.reserveReplyGate = make(chan struct{})
	fake.reserveCommitted = make(chan struct{}, 1)
	fake.completeGate = make(chan struct{})
	fake.completeEntered = make(chan struct{}, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	request := consumerRequest(ctx, public.URL, "model-a")
	select {
	case <-fake.reserveCommitted:
	case <-time.After(5 * time.Second):
		t.Fatal("admission was not committed")
	}
	cancel()
	select {
	case <-fake.completeEntered:
	case <-time.After(5 * time.Second):
		t.Fatal("cancelled admission was not completed")
	}
	close(fake.reserveReplyGate)
	close(fake.completeGate)
	if got := result(t, request); got.err == nil {
		t.Fatal("cancelled client succeeded")
	}
	select {
	case entry := <-fake.finished:
		if entry["state"] != "cancelled" || entry["errorCode"] != "request_cancelled" {
			t.Fatalf("incorrect cancellation metadata %+v", entry)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancellation was not persisted")
	}
	fake.mu.Lock()
	active := fake.active
	used := fake.used
	fake.mu.Unlock()
	if active != 0 || used != 1 {
		t.Fatalf("admission cleanup active=%d used=%d", active, used)
	}
	for {
		select {
		case frame := <-n.frames:
			if frame.Type == "request" {
				t.Fatal("cancelled admission was dispatched")
			}
		default:
			return
		}
	}
}

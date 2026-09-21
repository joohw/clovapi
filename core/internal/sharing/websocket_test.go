package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/relaywire"
	"github.com/gorilla/websocket"
)

type workerPeer struct {
	conn   *websocket.Conn
	mu     sync.Mutex
	frames chan relaywire.Message
	pings  chan struct{}
}

func (p *workerPeer) send(t *testing.T, message relaywire.Message) {
	t.Helper()
	p.mu.Lock()
	defer p.mu.Unlock()
	_ = p.conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
	if err := p.conn.WriteJSON(message); err != nil {
		t.Fatal(err)
	}
}

func (p *workerPeer) next(t *testing.T, want func(relaywire.Message) bool) relaywire.Message {
	t.Helper()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for {
		select {
		case frame, ok := <-p.frames:
			if !ok {
				t.Fatal("worker connection closed before expected frame")
			}
			if want(frame) {
				return frame
			}
		case <-timer.C:
			t.Fatal("worker frame timed out")
		}
	}
}

type runningWorker struct {
	worker *Worker
	dir    string
	peers  chan *workerPeer
	stop   context.CancelFunc
	done   chan error
	closed atomic.Bool
}

func startSocketWorker(t *testing.T, limit int, execute ExecuteFunc) *runningWorker {
	t.Helper()
	run := &runningWorker{dir: fixture(t), peers: make(chan *workerPeer, 10), done: make(chan error, 1)}
	if err := SetDailyLimit(run.dir, limit); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/node/connect" || r.Header.Get("Authorization") != "Bearer clv_node_secret" {
			t.Errorf("unexpected transport: %s", r.URL.Path)
			w.WriteHeader(404)
			return
		}
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		peer := &workerPeer{conn: conn, frames: make(chan relaywire.Message, 256), pings: make(chan struct{}, 256)}
		conn.SetPingHandler(func(data string) error {
			peer.mu.Lock()
			defer peer.mu.Unlock()
			deadline := time.Now().Add(3 * time.Second)
			if err := conn.WriteControl(websocket.PongMessage, []byte(data), deadline); err != nil {
				return err
			}
			select {
			case peer.pings <- struct{}{}:
			default:
			}
			return nil
		})
		defer close(peer.frames)
		if err := conn.WriteJSON(relaywire.Message{Type: "welcome", Protocol: relaywire.Protocol, NodeID: "node-1", Concurrency: 5, DailyLimit: 100}); err != nil {
			return
		}
		select {
		case run.peers <- peer:
		case <-r.Context().Done():
			return
		}
		for {
			var frame relaywire.Message
			if conn.ReadJSON(&frame) != nil {
				return
			}
			select {
			case peer.frames <- frame:
			case <-r.Context().Done():
				return
			}
		}
	}))
	ctx, cancel := context.WithCancel(context.Background())
	run.stop = cancel
	run.worker = &Worker{Dir: run.dir, Client: NewClient(server.URL, "clv_node_secret"), Execute: execute, LocalCheckInterval: 20 * time.Millisecond, HeartbeatInterval: 50 * time.Millisecond, ReconnectInterval: 20 * time.Millisecond}
	go func() { run.done <- run.worker.Run(ctx) }()
	t.Cleanup(func() {
		cancel()
		if !run.closed.Swap(true) {
			select {
			case err := <-run.done:
				if err != nil {
					t.Errorf("worker shutdown: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Error("worker did not join cancelled jobs")
			}
		}
		server.Close()
	})
	return run
}

func (r *runningWorker) peer(t *testing.T) *workerPeer {
	t.Helper()
	select {
	case peer := <-r.peers:
		hello := peer.next(t, func(m relaywire.Message) bool { return m.Type == "hello" })
		if hello.Concurrency != 5 || hello.Protocol != relaywire.Protocol {
			t.Fatalf("bad hello=%+v", hello)
		}
		return peer
	case err := <-r.done:
		r.closed.Store(true)
		t.Fatalf("worker stopped before connect: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("worker did not connect")
	}
	return nil
}

func request(id string) relaywire.Message {
	return relaywire.Message{Type: "request", ID: id, Path: "/v1/responses", Body: json.RawMessage(`{"model":"test-model"}`), Deadline: time.Now().Add(time.Minute)}
}

func (p *workerPeer) expectNoApplicationFrame(t *testing.T, wait time.Duration) {
	t.Helper()
	select {
	case frame, ok := <-p.frames:
		if !ok {
			t.Fatal("worker connection closed while idle")
		}
		t.Fatalf("unexpected application frame while state was unchanged: %+v", frame)
	case <-time.After(wait):
	}
}

func TestWebSocketIdleUsesControlPingWithoutPeriodicState(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	run := startSocketWorker(t, 10, func(_ context.Context, _ State, _ Job, w http.ResponseWriter) error {
		_, err := w.Write([]byte("ok"))
		return err
	})
	peer := run.peer(t)

	// The old 100 ms sync interval emitted unchanged application state. Stay
	// idle beyond it and verify that only control pings cross the connection.
	peer.expectNoApplicationFrame(t, 250*time.Millisecond)
	if len(peer.pings) < 2 {
		t.Fatalf("control pings observed = %d, want at least 2", len(peer.pings))
	}

	// A successful state frame after multiple ping/pong exchanges proves the
	// connection stayed alive, and unchanged state must not be repeated.
	if err := SetPaused(run.dir, true); err != nil {
		t.Fatal(err)
	}
	paused := peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" })
	if !paused.Paused {
		t.Fatalf("paused state=%+v", paused)
	}
	peer.expectNoApplicationFrame(t, 150*time.Millisecond)

	if err := SetPaused(run.dir, false); err != nil {
		t.Fatal(err)
	}
	unpaused := peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" })
	if unpaused.Paused {
		t.Fatalf("unpaused state=%+v", unpaused)
	}
	peer.expectNoApplicationFrame(t, 150*time.Millisecond)
}

func TestWebSocketFiveJobsRunConcurrentlyAndSixthIsRejected(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	var active, maxActive atomic.Int32
	started := make(chan string, 5)
	release := make(chan struct{})
	run := startSocketWorker(t, 10, func(ctx context.Context, _ State, job Job, w http.ResponseWriter) error {
		n := active.Add(1)
		defer active.Add(-1)
		for previous := maxActive.Load(); n > previous && !maxActive.CompareAndSwap(previous, n); previous = maxActive.Load() {
		}
		started <- job.ID
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-release:
		}
		_, err := w.Write([]byte("ok"))
		return err
	})
	peer := run.peer(t)
	for i := 0; i < 5; i++ {
		peer.send(t, request(fmt.Sprintf("job-%d", i)))
	}
	for i := 0; i < 5; i++ {
		select {
		case <-started:
		case <-time.After(3 * time.Second):
			t.Fatal("five jobs did not overlap")
		}
	}
	peer.send(t, request("sixth"))
	rejected := peer.next(t, func(m relaywire.Message) bool { return m.ID == "sixth" })
	if rejected.Type != "error" || rejected.Code != "node_busy" {
		t.Fatalf("sixth request=%+v", rejected)
	}
	peer.send(t, relaywire.Message{Type: "cancel", ID: "job-0"})
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "job-0" && m.Type == "error" })
	close(release)
	ended := 0
	for ended < 4 {
		frame := peer.next(t, func(m relaywire.Message) bool { return m.Type == "end" })
		if frame.ID == "job-0" {
			t.Fatal("cancelled job completed")
		}
		ended++
	}
	if maxActive.Load() != 5 {
		t.Fatalf("maximum concurrency=%d", maxActive.Load())
	}
	status, err := Snapshot(run.dir, time.Now())
	if err != nil || status.Used != 6 || status.Concurrency != 5 {
		t.Fatalf("attempts/concurrency=%+v err=%v", status, err)
	}
}

func TestWebSocketBackpressureIsPerJobAndAcknowledgementUnblocks(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	run := startSocketWorker(t, 10, func(ctx context.Context, _ State, job Job, w http.ResponseWriter) error {
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Set-Cookie", "private-cookie")
		if job.ID == "fast" {
			_, err := w.Write([]byte("fast"))
			return err
		}
		_, err := w.Write(bytes.Repeat([]byte("s"), relaywire.InitialWindow+relaywire.MaxChunkBytes))
		return err
	})
	peer := run.peer(t)
	peer.send(t, request("slow"))
	received := 0
	seq := 0
	for received < relaywire.InitialWindow {
		frame := peer.next(t, func(m relaywire.Message) bool { return m.ID == "slow" })
		if frame.Seq != seq {
			t.Fatalf("sequence=%d want%d", frame.Seq, seq)
		}
		seq++
		if frame.Type == "data" {
			received += len(frame.Data)
			if len(frame.Data) > relaywire.MaxChunkBytes {
				t.Fatal("oversized chunk")
			}
		}
		if frame.Type == "headers" && frame.ContentType != "text/event-stream" {
			t.Fatal("stream header lost")
		}
		raw, _ := json.Marshal(frame)
		if bytes.Contains(raw, []byte("private-cookie")) {
			t.Fatal("upstream header leaked")
		}
	}
	peer.send(t, request("fast"))
	for {
		frame := peer.next(t, func(m relaywire.Message) bool { return m.ID != "" })
		if frame.ID == "slow" {
			t.Fatal("slow request sent data without credit")
		}
		if frame.ID == "fast" && frame.Type == "end" {
			break
		}
	}
	peer.send(t, relaywire.Message{Type: "ack", ID: "slow", Bytes: relaywire.MaxChunkBytes})
	last := peer.next(t, func(m relaywire.Message) bool { return m.ID == "slow" && m.Type == "data" })
	if len(last.Data) != relaywire.MaxChunkBytes || last.Seq != seq {
		t.Fatalf("last chunk=%+v", last)
	}
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "slow" && m.Type == "end" })
	peer.send(t, request("cancel-waiting"))
	received = 0
	for received < relaywire.InitialWindow {
		frame := peer.next(t, func(m relaywire.Message) bool { return m.ID == "cancel-waiting" && m.Type == "data" })
		received += len(frame.Data)
	}
	peer.send(t, relaywire.Message{Type: "cancel", ID: "cancel-waiting"})
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "cancel-waiting" && m.Type == "error" })
}

func TestWebSocketDropCancelsJobsBeforeReconnectAndNeverReplays(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	started := make(chan struct{}, 1)
	cancelled := make(chan struct{}, 1)
	var executions atomic.Int32
	run := startSocketWorker(t, 5, func(ctx context.Context, _ State, _ Job, _ http.ResponseWriter) error {
		executions.Add(1)
		started <- struct{}{}
		<-ctx.Done()
		cancelled <- struct{}{}
		return ctx.Err()
	})
	first := run.peer(t)
	first.send(t, request("once-only"))
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("request not started")
	}
	_ = first.conn.Close()
	second := run.peer(t)
	select {
	case <-cancelled:
	default:
		t.Fatal("reconnected before joining cancelled upstream")
	}
	second.send(t, request("once-only"))
	frame := second.next(t, func(m relaywire.Message) bool { return m.ID == "once-only" })
	if frame.Type != "error" || frame.Code != "node_unavailable" || executions.Load() != 1 {
		t.Fatalf("replayed request=%+v executions=%d", frame, executions.Load())
	}
	status, err := Snapshot(run.dir, time.Now())
	if err != nil || status.Used != 1 {
		t.Fatalf("attempts=%+v %v", status, err)
	}
}

func TestWebSocketStateTracksEmptyInventoryLocalPauseAndQuota(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	run := startSocketWorker(t, 1, func(_ context.Context, _ State, _ Job, w http.ResponseWriter) error {
		_, err := w.Write([]byte("ok"))
		return err
	})
	peer := run.peer(t)
	if err := profile.Save(&profile.Store{Version: profile.StoreVersion}); err != nil {
		t.Fatal(err)
	}
	empty := peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" })
	if !empty.Paused || len(empty.Models) != 0 {
		t.Fatalf("empty state=%+v", empty)
	}
	if err := profile.Save(&profile.Store{Version: profile.StoreVersion, List: []profile.Profile{{Name: "saved-api", Model: "test-model", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:1", APIKey: "private"}}}); err != nil {
		t.Fatal(err)
	}
	peer.next(t, func(m relaywire.Message) bool {
		return m.Type == "state" && !m.Paused && slices.Equal(m.Models, []string{"test-model"})
	})
	if err := SetPaused(run.dir, true); err != nil {
		t.Fatal(err)
	}
	peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" && m.Paused })
	if err := SetPaused(run.dir, false); err != nil {
		t.Fatal(err)
	}
	peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" && !m.Paused })
	peer.send(t, request("last-allowance"))
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "last-allowance" && m.Type == "end" })
	peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" && m.Paused && m.Remaining == 0 })
	peer.send(t, request("over-limit"))
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "over-limit" && m.Code == "node_unavailable" })
	if err := profile.Save(&profile.Store{Version: profile.StoreVersion}); err != nil {
		t.Fatal(err)
	}
	peer.next(t, func(m relaywire.Message) bool { return m.Type == "state" && len(m.Models) == 0 })
}

func TestWebSocketRejectsInvalidJobsWithoutLeakingDiagnostics(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	var executions atomic.Int32
	run := startSocketWorker(t, 10, func(context.Context, State, Job, http.ResponseWriter) error {
		executions.Add(1)
		return errors.New("https://private.example?key=upstream-secret")
	})
	peer := run.peer(t)
	jobs := []relaywire.Message{request("wrong-model"), request("wrong-path"), request("oversize"), request("upstream-failure")}
	jobs[0].Body = json.RawMessage(`{"model":"unavailable"}`)
	jobs[1].Path = "https://attacker.example/v1/responses"
	jobs[2].Body = json.RawMessage(`{"model":"test-model","input":"` + strings.Repeat("x", relaywire.MaxRequestBytes) + `"}`)
	for _, job := range jobs {
		peer.send(t, job)
		frame := peer.next(t, func(m relaywire.Message) bool { return m.ID == job.ID })
		if frame.Type != "error" || frame.Code != "node_error" {
			t.Fatalf("invalid job result=%+v", frame)
		}
		raw, _ := json.Marshal(frame)
		for _, private := range []string{"upstream-secret", "private.example", "attacker.example"} {
			if bytes.Contains(raw, []byte(private)) {
				t.Fatal("diagnostic leaked")
			}
		}
	}
	if executions.Load() != 1 {
		t.Fatalf("unsafe requests executed: %d", executions.Load())
	}
	status, err := Snapshot(run.dir, time.Now())
	if err != nil || status.Used != 4 {
		t.Fatalf("invalid request attempts=%+v %v", status, err)
	}
}

func TestWebSocketRedirectDoesNotForwardCredential(t *testing.T) {
	var followed atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { followed.Store(true) }))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()
	worker := &Worker{Client: NewClient(origin.URL, "private-node-key")}
	_, err := worker.dial(context.Background())
	if err == nil || followed.Load() {
		t.Fatal("WebSocket redirected credential")
	}
}

func TestFlowCreditRejectsOverAcknowledgement(t *testing.T) {
	credit := newFlowCredit()
	if credit.ack(1) || credit.ack(-1) {
		t.Fatal("unsolicited credit accepted")
	}
	if err := credit.take(context.Background(), relaywire.MaxChunkBytes); err != nil {
		t.Fatal(err)
	}
	if credit.ack(relaywire.MaxChunkBytes+1) || !credit.ack(relaywire.MaxChunkBytes) {
		t.Fatal("invalid credit window")
	}
	if err := credit.take(context.Background(), 12); err != nil {
		t.Fatal(err)
	}
	if err := credit.take(context.Background(), 7); err != nil {
		t.Fatal(err)
	}
	if credit.ack(7) || credit.ack(11) || !credit.ack(12) || !credit.ack(7) {
		t.Fatal("acknowledgements must match complete frames in send order")
	}
}

func TestWebSocketTinyChunksRespectFrameCreditWithoutBlockingOtherJobs(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	run := startSocketWorker(t, 10, func(_ context.Context, _ State, job Job, w http.ResponseWriter) error {
		if job.ID == "fast" {
			_, err := w.Write([]byte("fast"))
			return err
		}
		for i := 0; i < relaywire.MaxInflightFrames+1; i++ {
			if _, err := w.Write([]byte("s")); err != nil {
				return err
			}
		}
		return nil
	})
	peer := run.peer(t)
	peer.send(t, request("tiny"))
	for i := 0; i < relaywire.MaxInflightFrames; i++ {
		frame := peer.next(t, func(m relaywire.Message) bool { return m.ID == "tiny" && m.Type == "data" })
		if len(frame.Data) != 1 {
			t.Fatal("test must exercise single-byte frames")
		}
	}
	peer.send(t, request("fast"))
	for {
		frame := peer.next(t, func(m relaywire.Message) bool { return m.ID != "" })
		if frame.ID == "tiny" {
			t.Fatal("tiny stream exceeded its unacknowledged frame window")
		}
		if frame.ID == "fast" && frame.Type == "end" {
			break
		}
	}
	peer.send(t, relaywire.Message{Type: "ack", ID: "tiny", Bytes: 1})
	last := peer.next(t, func(m relaywire.Message) bool { return m.ID == "tiny" && m.Type == "data" })
	if len(last.Data) != 1 || last.Seq != relaywire.MaxInflightFrames+1 {
		t.Fatalf("last tiny frame=%+v", last)
	}
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "tiny" && m.Type == "end" })
}

func TestCompletedJobReleasesLocalSlotBeforeTerminalFrame(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	peerReady := make(chan *workerPeer, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		peer := &workerPeer{conn: conn, frames: make(chan relaywire.Message, 5)}
		peerReady <- peer
		defer close(peer.frames)
		for {
			var frame relaywire.Message
			if conn.ReadJSON(&frame) != nil {
				return
			}
			peer.frames <- frame
		}
	}))
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	peer := <-peerReady
	started := make(chan struct{})
	release := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	dir := fixture(t)
	session := &nodeConnection{worker: &Worker{Dir: dir, Discover: Discover, Execute: func(context.Context, State, Job, http.ResponseWriter) error {
		close(started)
		<-release
		return nil
	}}, state: testState(), conn: conn, ctx: ctx, cancel: cancel, writeGate: make(chan struct{}, 1), jobs: map[string]*activeJob{}, seen: map[string]struct{}{}, stateWake: make(chan struct{}, 1)}
	session.writeGate <- struct{}{}
	if err := session.accept(request("finished")); err != nil {
		t.Fatal(err)
	}
	<-started
	session.jobsMu.Lock()
	close(release)
	// Finishing must wait for local slot bookkeeping before the relay sees
	// any terminal response and is allowed to dispatch a replacement.
	select {
	case <-peer.frames:
		session.jobsMu.Unlock()
		session.jobsDone.Wait()
		t.Fatal("response was sent before the execution slot was released")
	case <-time.After(30 * time.Millisecond):
	}
	session.jobsMu.Unlock()
	peer.next(t, func(m relaywire.Message) bool { return m.ID == "finished" && m.Type == "end" })
	session.jobsMu.Lock()
	remaining := len(session.jobs)
	session.jobsMu.Unlock()
	if remaining != 0 {
		t.Fatal("completed execution slot remained occupied")
	}
	session.jobsDone.Wait()
}

func TestJobDeadlineWaitingForWriterDoesNotCloseConnection(t *testing.T) {
	parent, cancel := context.WithCancel(context.Background())
	defer cancel()
	session := &nodeConnection{ctx: parent, cancel: cancel, writeGate: make(chan struct{})}
	job, cancelJob := context.WithTimeout(parent, 5*time.Millisecond)
	defer cancelJob()
	err := session.send(job, relaywire.Message{Type: "data", ID: "one"})
	if !errors.Is(err, context.DeadlineExceeded) || parent.Err() != nil {
		t.Fatalf("job deadline closed shared connection: err=%v parent=%v", err, parent.Err())
	}
}

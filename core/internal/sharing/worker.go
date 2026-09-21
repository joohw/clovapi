package sharing

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/clovapi/switcher/internal/relaywire"
	"github.com/gorilla/websocket"
)

var taskIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type Worker struct {
	Dir      string
	Client   *Client
	Execute  ExecuteFunc
	Discover func() (*Inventory, error)
	Log      io.Writer
	Dialer   *websocket.Dialer
	// Overrides keep connection lifecycle tests deterministic and fast.
	HeartbeatInterval  time.Duration
	LocalCheckInterval time.Duration
	ReconnectInterval  time.Duration
}

func (w *Worker) Run(ctx context.Context) error {
	if err := prepareDir(w.Dir); err != nil {
		return err
	}
	unlock, err := acquireLock(filepath.Join(w.Dir, "run.lock"), false)
	if err != nil {
		return errors.New("a share worker is already running for this configuration")
	}
	defer unlock()
	state, err := Read(w.Dir)
	if err != nil {
		return err
	}
	if w.Client == nil {
		w.Client = NewClient(state.Platform, state.Key)
	}
	if w.Execute == nil {
		w.Execute = Execute
	}
	if w.Discover == nil {
		w.Discover = Discover
	}
	baseDelay := w.ReconnectInterval
	if baseDelay <= 0 {
		baseDelay = time.Second
	}
	backoff := baseDelay
	for ctx.Err() == nil {
		started := time.Now()
		conn, dialErr := w.dial(ctx)
		err = dialErr
		if err == nil {
			err = w.runConnection(ctx, state, conn)
		}
		if ctx.Err() != nil {
			return nil
		}
		var closeErr *websocket.CloseError
		if permanent(err) || (errors.As(err, &closeErr) && (closeErr.Code == 4001 || closeErr.Code == 4003)) {
			return errors.New("node authorization was revoked or is invalid; copy a new clovapi share start --key command from the console to reconnect")
		}
		var invalid *invalidWelcomeError
		if errors.As(err, &invalid) {
			return err
		}
		if w.Log != nil {
			fmt.Fprintln(w.Log, "Node connection lost; reconnecting.")
		}
		if time.Since(started) >= 30*time.Second {
			backoff = baseDelay
		}
		// Every disconnected session has already cancelled and joined all jobs.
		// A reconnect never replays an upstream attempt or a partial response.
		delay := backoff + time.Duration(rand.Int64N(max(int64(backoff/4), 1)))
		if !sleepContext(ctx, delay) {
			return nil
		}
		backoff = min(backoff*2, 10*time.Second)
	}
	return nil
}

func (w *Worker) dial(ctx context.Context) (*websocket.Conn, error) {
	platform, err := NormalizePlatform(w.Client.Platform)
	if err != nil {
		return nil, err
	}
	url := "ws" + strings.TrimPrefix(platform, "http") + "/api/node/connect"
	dialer := *websocket.DefaultDialer
	dialer.HandshakeTimeout = 15 * time.Second
	if w.Dialer != nil {
		dialer = *w.Dialer
	}
	conn, response, err := dialer.DialContext(ctx, url, http.Header{"Authorization": []string{"Bearer " + w.Client.Key}})
	if response != nil && response.Body != nil {
		response.Body.Close()
	}
	if err != nil && response != nil {
		return nil, &APIError{Status: response.StatusCode}
	}
	return conn, err
}

type invalidWelcomeError struct{}

func (*invalidWelcomeError) Error() string {
	return "platform WebSocket protocol or node identity does not match this CLI"
}

type nodeConnection struct {
	worker         *Worker
	state          State
	conn           *websocket.Conn
	ctx            context.Context
	cancel         context.CancelFunc
	writeGate      chan struct{}
	closeOnce      sync.Once
	jobsMu         sync.Mutex
	jobs           map[string]*activeJob
	seen           map[string]struct{}
	jobsDone       sync.WaitGroup
	stateWake      chan struct{}
	legacyMigrated bool
}

type activeJob struct {
	cancel context.CancelFunc
	credit *flowCredit
}

func (w *Worker) runConnection(parent context.Context, state State, conn *websocket.Conn) error {
	ctx, cancel := context.WithCancel(parent)
	s := &nodeConnection{worker: w, state: state, conn: conn, ctx: ctx, cancel: cancel, writeGate: make(chan struct{}, 1), jobs: map[string]*activeJob{}, seen: map[string]struct{}{}, stateWake: make(chan struct{}, 1)}
	s.writeGate <- struct{}{}
	stopOnCancel := context.AfterFunc(ctx, s.close)
	defer func() { s.close(); stopOnCancel(); s.jobsDone.Wait() }()
	conn.SetReadLimit(int64(relaywire.MaxRequestBytes + 64*1024))
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(30 * time.Second)) })
	conn.SetPingHandler(func(data string) error { return s.writeControl(websocket.PongMessage, []byte(data)) })
	initial, err := s.localState("hello")
	if err != nil {
		return err
	}
	if err = s.send(ctx, initial); err != nil {
		return err
	}
	var welcome relaywire.Message
	if err = conn.ReadJSON(&welcome); err != nil {
		return err
	}
	if welcome.Type != "welcome" || welcome.Protocol != relaywire.Protocol || welcome.NodeID != state.NodeID || welcome.Concurrency != relaywire.MaxConcurrency {
		return &invalidWelcomeError{}
	}
	if w.Log != nil {
		fmt.Fprintf(w.Log, "Shared node connected: WebSocket, up to %d concurrent requests; Ctrl+C stops the worker.\n", relaywire.MaxConcurrency)
	}
	monitorDone := make(chan struct{})
	go func() { defer close(monitorDone); s.monitor(initial) }()
	defer func() { s.close(); <-monitorDone }()
	for {
		var message relaywire.Message
		if err = conn.ReadJSON(&message); err != nil {
			return err
		}
		_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		switch message.Type {
		case "request":
			if err = s.accept(message); err != nil {
				return err
			}
		case "cancel", "ack":
			s.jobsMu.Lock()
			job := s.jobs[message.ID]
			s.jobsMu.Unlock()
			if job == nil {
				continue
			}
			if message.Type == "cancel" {
				job.cancel()
			} else if !job.credit.ack(message.Bytes) {
				return errors.New("invalid WebSocket flow-control acknowledgement")
			}
		case "policy":
			if message.Concurrency != relaywire.MaxConcurrency {
				return &invalidWelcomeError{}
			}
			// Platform policy controls dispatch there. It never changes the
			// independent persisted local allowance or cancels active work.
		default:
			return errors.New("unexpected platform WebSocket frame")
		}
	}
}

func (s *nodeConnection) close() {
	s.closeOnce.Do(func() { s.cancel(); _ = s.conn.Close() })
}

func (s *nodeConnection) send(ctx context.Context, message relaywire.Message) error {
	deadline := time.Now().Add(5 * time.Second)
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-s.ctx.Done():
		return s.ctx.Err()
	case <-timer.C:
		if ctx.Err() != nil {
			return ctx.Err()
		}
		s.close()
		return context.DeadlineExceeded
	case <-s.writeGate:
	}
	defer func() { s.writeGate <- struct{}{} }()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	// A job deadline can cancel its wait for the writer, but must not truncate
	// a shared socket frame and disconnect the other active requests.
	if err := s.conn.SetWriteDeadline(deadline); err != nil {
		s.close()
		return err
	}
	if err := s.conn.WriteJSON(message); err != nil {
		s.close()
		return err
	}
	return nil
}

func (s *nodeConnection) writeControl(kind int, data []byte) error {
	deadline := time.Now().Add(5 * time.Second)
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	select {
	case <-s.ctx.Done():
		return s.ctx.Err()
	case <-timer.C:
		s.close()
		return context.DeadlineExceeded
	case <-s.writeGate:
	}
	defer func() { s.writeGate <- struct{}{} }()
	if err := s.conn.WriteControl(kind, data, deadline); err != nil {
		s.close()
		return err
	}
	return nil
}

func (s *nodeConnection) localState(kind string) (relaywire.Message, error) {
	status, err := Snapshot(s.worker.Dir, time.Now())
	if err != nil {
		return relaywire.Message{}, err
	}
	inventory, err := s.worker.Discover()
	if err != nil {
		inventory = &Inventory{Models: []string{}}
	}
	if !slices.Equal(status.Models, inventory.Models) || (!s.legacyMigrated && (s.state.Profile != "" || s.state.Model != "")) {
		if err := saveModels(s.worker.Dir, inventory.Models); err != nil {
			return relaywire.Message{}, err
		}
		s.legacyMigrated = true
	}
	remaining := max(status.DailyLimit-status.Used, 0)
	return relaywire.Message{Type: kind, Protocol: relaywire.Protocol, Models: append([]string{}, inventory.Models...), Paused: status.Paused || remaining == 0 || len(inventory.Models) == 0, Remaining: int64(remaining), Concurrency: relaywire.MaxConcurrency}, nil
}

func (s *nodeConnection) monitor(previous relaywire.Message) {
	checkEvery, pingEvery := s.worker.LocalCheckInterval, s.worker.HeartbeatInterval
	if checkEvery <= 0 {
		checkEvery = time.Second
	}
	if pingEvery <= 0 {
		pingEvery = 10 * time.Second
	}
	check := time.NewTicker(checkEvery)
	defer check.Stop()
	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ping.C:
			if s.writeControl(websocket.PingMessage, nil) != nil {
				return
			}
			continue
		case <-check.C:
		case <-s.stateWake:
		}
		current, err := s.localState("state")
		if err != nil {
			s.close()
			return
		}
		if current.Paused != previous.Paused || current.Remaining != previous.Remaining || !slices.Equal(current.Models, previous.Models) {
			if s.send(s.ctx, current) != nil {
				return
			}
			previous = current
		}
	}
}

func (s *nodeConnection) wakeState() {
	select {
	case s.stateWake <- struct{}{}:
	default:
	}
}

func (s *nodeConnection) accept(message relaywire.Message) error {
	if !taskIDPattern.MatchString(message.ID) {
		return errors.New("invalid WebSocket request identity")
	}
	if _, exists := s.seen[message.ID]; exists {
		return nil
	}
	if len(s.seen) >= 100000 {
		return errors.New("WebSocket session request limit reached")
	}
	s.seen[message.ID] = struct{}{}
	if err := reserve(s.worker.Dir, message.ID, time.Now()); err != nil {
		return s.send(s.ctx, relaywire.Message{Type: "error", ID: message.ID, Code: "node_unavailable"})
	}
	s.wakeState()
	s.jobsMu.Lock()
	if len(s.jobs) >= relaywire.MaxConcurrency {
		s.jobsMu.Unlock()
		return s.send(s.ctx, relaywire.Message{Type: "error", ID: message.ID, Code: "node_busy"})
	}
	deadline := message.Deadline
	if deadline.IsZero() || deadline.After(time.Now().Add(relaywire.RequestTimeout)) {
		deadline = time.Now().Add(relaywire.RequestTimeout)
	}
	ctx, cancel := context.WithDeadline(s.ctx, deadline)
	active := &activeJob{cancel: cancel, credit: newFlowCredit()}
	s.jobs[message.ID] = active
	s.jobsDone.Add(1)
	s.jobsMu.Unlock()
	go func() {
		defer s.jobsDone.Done()
		defer cancel()
		writer := &socketWriter{session: s, ctx: ctx, cancel: cancel, id: message.ID, credit: active.credit, header: make(http.Header)}
		job := Job{ID: message.ID, Path: message.Path, Body: message.Body, Deadline: deadline}
		inventory, err := s.worker.Discover()
		state := s.state
		if err == nil {
			state, err = inventory.forJob(state, job)
		}
		if err == nil {
			_, err = validatedBody(state, job)
		}
		if err == nil {
			err = s.worker.Execute(ctx, state, job, writer)
		}
		// All upstream writes have returned. Free the execution slot before the
		// terminal frame lets the relay dispatch its next request to this node.
		s.jobsMu.Lock()
		delete(s.jobs, message.ID)
		s.jobsMu.Unlock()
		s.wakeState()
		writer.finish(err)
	}()
	return nil
}

func sleepContext(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

package relay

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/clovapi/switcher/internal/relaywire"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type node struct {
	s                                  *Server
	id, key, connectionID              string
	ws                                 *websocket.Conn
	ctx                                context.Context
	cancel                             context.CancelFunc
	once                               sync.Once
	mu                                 sync.Mutex
	ready, closed, paused, localPaused bool
	dailyLimit, used, remaining        int64
	models                             map[string]bool
	jobs                               map[string]*job
	out                                chan relaywire.Message
	states                             chan relaywire.Message
}

func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, 405, "method_not_allowed")
		return
	}
	key := bearer(r)
	if key == "" {
		writeError(w, 401, "unauthorized")
		return
	}
	if !websocket.IsWebSocketUpgrade(r) {
		writeError(w, 426, "websocket_required")
		return
	}
	connectionID := uuid.NewString()
	policy, err := s.control(r.Context(), "connect", map[string]any{"nodeKey": key, "connectionId": connectionID})
	if err != nil {
		writeControlError(w, err)
		return
	}
	upgrader := websocket.Upgrader{HandshakeTimeout: 10 * time.Second, ReadBufferSize: 4096, WriteBufferSize: 4096, CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == "" }}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		_, _ = s.control(context.Background(), "disconnect", map[string]any{"nodeKey": key, "connectionId": connectionID})
		return
	}
	ctx, cancel := context.WithCancel(s.ctx)
	// Acknowledge a full window for all five streams without coupling their
	// progress to the writer goroutine's scheduling. Control frames stay bounded.
	n := &node{s: s, id: policy.NodeID, key: key, connectionID: connectionID, ws: ws, ctx: ctx, cancel: cancel, dailyLimit: policy.DailyLimit, used: policy.Used, paused: policy.Paused, models: make(map[string]bool), jobs: make(map[string]*job), out: make(chan relaywire.Message, relaywire.MaxConcurrency*(relaywire.MaxInflightFrames+4)+16), states: make(chan relaywire.Message, 1)}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		n.close(websocket.CloseGoingAway, "relay_shutdown")
		return
	}
	old := s.nodes[n.id]
	s.nodes[n.id] = n
	s.connections.Add(1)
	s.mu.Unlock()
	defer s.connections.Done()
	if old != nil {
		old.close(4003, "connection_replaced")
	}
	defer func() {
		n.close(websocket.CloseInternalServerErr, "node_disconnected")
		_, _ = s.control(context.Background(), "disconnect", map[string]any{"nodeKey": key, "connectionId": connectionID})
	}()
	n.send(relaywire.Message{Type: "welcome", Protocol: relaywire.Protocol, NodeID: n.id, Concurrency: relaywire.MaxConcurrency, DailyLimit: policy.DailyLimit, Used: policy.Used, Paused: policy.Paused})
	go n.writeLoop()
	go n.stateLoop()
	n.readLoop()
}

func (n *node) send(m relaywire.Message) bool {
	select {
	case <-n.ctx.Done():
		return false
	default:
	}
	select {
	case n.out <- m:
		return true
	case <-n.ctx.Done():
		return false
	default:
		n.close(websocket.CloseInternalServerErr, "node_backpressure")
		return false
	}
}

func (n *node) close(code int, reason string) {
	n.once.Do(func() {
		n.mu.Lock()
		n.closed = true
		jobs := make([]*job, 0, len(n.jobs))
		for _, j := range n.jobs {
			jobs = append(jobs, j)
		}
		n.mu.Unlock()
		n.cancel()
		_ = n.ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, reason), time.Now().Add(time.Second))
		_ = n.ws.Close()
		for _, j := range jobs {
			j.fail("node_disconnected")
		}
		n.s.mu.Lock()
		if n.s.nodes[n.id] == n {
			delete(n.s.nodes, n.id)
		}
		n.s.mu.Unlock()
	})
}

func (n *node) writeLoop() {
	tick := time.NewTicker(relaywire.HeartbeatInterval)
	defer tick.Stop()
	for {
		select {
		case <-n.ctx.Done():
			return
		case <-tick.C:
			if n.ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(relaywire.WriteTimeout)) != nil {
				n.close(websocket.CloseInternalServerErr, "node_disconnected")
				return
			}
		case m := <-n.out:
			_ = n.ws.SetWriteDeadline(time.Now().Add(relaywire.WriteTimeout))
			if n.ws.WriteJSON(m) != nil {
				n.close(websocket.CloseInternalServerErr, "node_disconnected")
				return
			}
		}
	}
}

func (n *node) readLoop() {
	n.ws.SetReadLimit(64 * 1024)
	_ = n.ws.SetReadDeadline(time.Now().Add(relaywire.ReadTimeout))
	n.ws.SetPongHandler(func(string) error { return n.ws.SetReadDeadline(time.Now().Add(relaywire.ReadTimeout)) })
	hello := false
	for {
		var m relaywire.Message
		if err := n.ws.ReadJSON(&m); err != nil {
			return
		}
		switch m.Type {
		case "hello", "state":
			if (!hello && (m.Type != "hello" || m.Protocol != relaywire.Protocol)) || (hello && m.Type == "hello") || len(m.Models) > 256 || m.Remaining < 0 || m.Concurrency != relaywire.MaxConcurrency {
				n.close(websocket.ClosePolicyViolation, "invalid_protocol")
				return
			}
			hello = true
			for _, id := range m.Models {
				if !modelPattern.MatchString(id) {
					n.close(websocket.ClosePolicyViolation, "invalid_models")
					return
				}
			}
			select {
			case n.states <- m:
			default:
				select {
				case <-n.states:
				default:
				}
				select {
				case n.states <- m:
				default:
				}
			}
		case "headers", "data", "end", "error":
			if !hello {
				n.close(websocket.ClosePolicyViolation, "hello_required")
				return
			}
			n.mu.Lock()
			j := n.jobs[m.ID]
			n.mu.Unlock()
			if j != nil {
				j.receive(m)
			}
		default:
			n.close(websocket.ClosePolicyViolation, "invalid_protocol")
			return
		}
	}
}

func (n *node) stateLoop() {
	for {
		select {
		case <-n.ctx.Done():
			return
		case m := <-n.states:
			if m.Models == nil {
				m.Models = []string{}
			}
			policy, err := n.s.control(n.ctx, "sync", map[string]any{"nodeKey": n.key, "connectionId": n.connectionID, "models": m.Models, "paused": m.Paused, "remaining": m.Remaining})
			if err != nil {
				if e, ok := err.(*controlError); ok && (e.status == 401 || e.status == 403 || e.status == 409) {
					n.close(4001, "auth_invalid")
				} else {
					n.close(websocket.CloseInternalServerErr, "control_plane_unavailable")
				}
				return
			}
			n.mu.Lock()
			n.models = make(map[string]bool, len(m.Models))
			for _, model := range m.Models {
				n.models[model] = true
			}
			n.localPaused = m.Paused
			n.remaining = m.Remaining
			n.paused = policy.Paused
			n.dailyLimit = policy.DailyLimit
			n.used = policy.Used
			n.ready = true
			cancelled := make([]*job, 0, len(policy.CancelIDs))
			for _, id := range policy.CancelIDs {
				if j := n.jobs[id]; j != nil {
					cancelled = append(cancelled, j)
				}
			}
			n.mu.Unlock()
			for _, j := range cancelled {
				j.fail("request_cancelled")
				n.send(relaywire.Message{Type: "cancel", ID: j.id})
			}
		}
	}
}

func (n *node) available(model string) bool {
	return n.ready && !n.closed && !n.paused && !n.localPaused && n.remaining > 0 && n.used < n.dailyLimit && len(n.jobs) < relaywire.MaxConcurrency && (model == "" || n.models[model])
}

func (n *node) cancelConsumer(consumerID string) {
	n.mu.Lock()
	jobs := make([]*job, 0, len(n.jobs))
	for _, j := range n.jobs {
		if j.consumerID == consumerID {
			jobs = append(jobs, j)
		}
	}
	n.mu.Unlock()
	for _, j := range jobs {
		j.fail("request_cancelled")
		n.send(relaywire.Message{Type: "cancel", ID: j.id})
	}
}

package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"sort"
	"time"

	"github.com/clovapi/switcher/internal/relaywire"
	"github.com/google/uuid"
)

var modelPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,159}$`)

func writeControlError(w http.ResponseWriter, err error) {
	if e, ok := err.(*controlError); ok {
		switch e.status {
		case 401, 403:
			writeError(w, 401, "unauthorized")
			return
		case 429:
			writeError(w, 429, e.code)
			return
		case 400, 409, 503:
			writeError(w, e.status, e.code)
			return
		}
	}
	writeError(w, 503, "control_plane_unavailable")
}

func (s *Server) authenticate(w http.ResponseWriter, r *http.Request) (string, controlReply, bool) {
	key := bearer(r)
	if key == "" {
		writeError(w, 401, "unauthorized")
		return "", controlReply{}, false
	}
	identity, err := s.control(r.Context(), "consumer", map[string]any{"consumerKey": key})
	if err != nil {
		writeControlError(w, err)
		return "", controlReply{}, false
	}
	return key, identity, true
}

func (s *Server) models(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, 405, "method_not_allowed")
		return
	}
	if _, _, ok := s.authenticate(w, r); !ok {
		return
	}
	s.mu.Lock()
	nodes := make([]*node, 0, len(s.nodes))
	for _, n := range s.nodes {
		nodes = append(nodes, n)
	}
	s.mu.Unlock()
	models := make(map[string]bool)
	for _, n := range nodes {
		n.mu.Lock()
		if n.available("") {
			for id := range n.models {
				models[id] = true
			}
		}
		n.mu.Unlock()
	}
	ids := make([]string, 0, len(models))
	for id := range models {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	data := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		data = append(data, map[string]any{"id": id, "object": "model", "created": 0, "owned_by": "clovapi"})
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": data})
}

func (s *Server) request(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, 405, "method_not_allowed")
		return
	}
	if r.URL.Path != "/v1/chat/completions" && r.URL.Path != "/v1/responses" {
		writeError(w, 400, "invalid_request")
		return
	}
	mediaType, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "application/json" {
		writeError(w, 400, "invalid_content_type")
		return
	}
	key, identity, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	controller := http.NewResponseController(w)
	_ = controller.SetReadDeadline(time.Now().Add(10 * time.Second))
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, relaywire.MaxRequestBytes))
	_ = controller.SetReadDeadline(time.Time{})
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, 413, "request_too_large")
		} else {
			writeError(w, 400, "invalid_request")
		}
		return
	}
	var request struct {
		Model  string          `json:"model"`
		Stream json.RawMessage `json:"stream"`
	}
	if json.Unmarshal(body, &request) != nil || !modelPattern.MatchString(request.Model) || (request.Stream != nil && !bytes.Equal(bytes.TrimSpace(request.Stream), []byte("true")) && !bytes.Equal(bytes.TrimSpace(request.Stream), []byte("false"))) {
		writeError(w, 400, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), relaywire.RequestTimeout)
	defer cancel()
	deadline, _ := ctx.Deadline()
	id := uuid.NewString()
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		writeError(w, 503, "relay_unavailable")
		return
	}
	s.requests.Add(1)
	defer s.requests.Done()
	nodes := make([]*node, 0, len(s.nodes))
	for _, n := range s.nodes {
		nodes = append(nodes, n)
	}
	s.mu.Unlock()
	var selected *job
	for _, n := range nodes {
		jctx, jcancel := context.WithCancel(ctx)
		j := &job{id: id, consumerID: identity.ConsumerID, node: n, ctx: jctx, cancel: jcancel, frames: make(chan relaywire.Message, relaywire.MaxInflightFrames+2)}
		n.mu.Lock()
		if !n.available(request.Model) {
			n.mu.Unlock()
			jcancel()
			continue
		}
		n.jobs[id] = j
		n.mu.Unlock()
		policy, reserveErr := s.control(ctx, "reserve", map[string]any{"consumerKey": key, "nodeKey": n.key, "connectionId": n.connectionID, "requestId": id, "model": request.Model, "deadline": deadline.UnixMilli()})
		if reserveErr != nil {
			ce, isControl := reserveErr.(*controlError)
			rejected := isControl && (ce.code == "model_unavailable" || ce.code == "node_busy" || ce.code == "node_limit_reached")
			if !rejected && (!isControl || ce.status >= 500) {
				// The control plane may have committed admission before its reply
				// was lost. Complete the same ID before releasing the local slot;
				// unknown IDs become cancellation tombstones on the control plane,
				// so a delayed original reservation cannot resurrect this request.
				state, code, status := "failed", "control_plane_unavailable", 503
				if j.ctx.Err() != nil {
					state = "cancelled"
					code = "request_cancelled"
					status = 499
				}
				s.finish(completion{id: id, connectionID: n.connectionID, state: state, code: code, status: status})
			}
			n.mu.Lock()
			delete(n.jobs, id)
			n.mu.Unlock()
			jcancel()
			if rejected {
				continue
			}
			writeControlError(w, reserveErr)
			return
		}
		n.mu.Lock()
		n.dailyLimit = policy.DailyLimit
		if policy.Used > n.used {
			n.used = policy.Used
		}
		n.paused = policy.Paused
		n.remaining--
		n.mu.Unlock()
		selected = j
		break
	}
	if selected == nil {
		writeError(w, 503, "no_node_capacity")
		return
	}
	j := selected
	n := j.node
	state, code := "failed", "node_error"
	status := 502
	var written int64
	defer func() {
		j.cancel()
		if state != "completed" {
			n.send(relaywire.Message{Type: "cancel", ID: j.id})
		}
		s.finish(completion{id: j.id, connectionID: n.connectionID, state: state, code: code, status: status, bytes: written})
		n.mu.Lock()
		delete(n.jobs, j.id)
		n.mu.Unlock()
	}()
	if j.ctx.Err() != nil {
		state = "cancelled"
		code = "request_cancelled"
		status = 499
		if r.Context().Err() == nil {
			status = 502
			writeError(w, status, code)
		}
		return
	}
	if !n.send(relaywire.Message{Type: "request", ID: id, Path: r.URL.Path, Body: body, Deadline: deadline}) {
		writeError(w, 502, "node_disconnected")
		code = "node_disconnected"
		return
	}
	headers := false
	fail := func(errorCode string, httpStatus int) {
		code = errorCode
		if !headers {
			status = httpStatus
			writeError(w, httpStatus, errorCode)
			return
		}
		// Returning normally would turn a truncated SSE/JSON body into an HTTP
		// success. Abort just this consumer transport after headers were sent.
		panic(http.ErrAbortHandler)
	}
	for {
		select {
		case <-j.ctx.Done():
			j.mu.Lock()
			failure := j.code
			j.mu.Unlock()
			if r.Context().Err() != nil {
				state = "cancelled"
				code = "consumer_disconnected"
				if headers {
					panic(http.ErrAbortHandler)
				}
				status = 499
				return
			}
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				fail("request_timeout", 504)
				return
			}
			if failure == "" {
				failure = "request_cancelled"
			}
			if failure == "request_cancelled" {
				state = "cancelled"
			}
			fail(failure, 502)
			return
		case frame := <-j.frames:
			switch frame.Type {
			case "headers":
				status = frame.Status
				w.Header().Set("Content-Type", frame.ContentType)
				w.Header().Set("Cache-Control", "no-store")
				w.Header().Set("X-Accel-Buffering", "no")
				_ = controller.SetWriteDeadline(time.Now().Add(relaywire.WriteTimeout))
				w.WriteHeader(status)
				headers = true
				if controller.Flush() != nil {
					state = "cancelled"
					fail("consumer_disconnected", 502)
					return
				}
				_ = controller.SetWriteDeadline(time.Time{})
			case "data":
				_ = controller.SetWriteDeadline(time.Now().Add(relaywire.WriteTimeout))
				count, writeErr := w.Write(frame.Data)
				written += int64(count)
				if writeErr != nil || count != len(frame.Data) || controller.Flush() != nil {
					state = "cancelled"
					fail("consumer_disconnected", 502)
					return
				}
				_ = controller.SetWriteDeadline(time.Time{})
				j.acknowledge(count)
			case "end":
				state = "completed"
				code = ""
				_ = controller.SetWriteDeadline(time.Time{})
				return
			case "error":
				fail(publicNodeError(frame.Code), 502)
				return
			}
		}
	}
}

func publicNodeError(code string) string {
	switch code {
	case "node_busy", "model_unavailable", "node_unavailable", "invalid_request", "response_too_large", "request_timeout":
		return code
	default:
		return "node_error"
	}
}

package relay

import (
	"context"
	"mime"
	"strings"
	"sync"

	"github.com/clovapi/switcher/internal/relaywire"
)

// A slow consumer can hold at most InitialWindow bytes and MaxInflightFrames
// data frames. The separate frame window also bounds tiny SSE chunks. Its
// queue never blocks the WebSocket reader or another request on the node.
type job struct {
	id, consumerID  string
	node            *node
	ctx             context.Context
	cancel          context.CancelFunc
	mu              sync.Mutex
	code            string
	seq             int
	headers, ended  bool
	inflight, total int64
	inflightFrames  int
	frames          chan relaywire.Message
}

func (j *job) fail(code string) {
	j.mu.Lock()
	if j.code == "" {
		j.code = code
	}
	j.mu.Unlock()
	j.cancel()
}

func (j *job) receive(m relaywire.Message) {
	j.mu.Lock()
	if j.code != "" {
		j.mu.Unlock()
		return
	}
	code := ""
	if j.ended || m.Seq != j.seq {
		code = "invalid_node_response"
	} else {
		switch m.Type {
		case "headers":
			if j.headers || m.Status < 200 || m.Status > 599 || !validContentType(m.ContentType) {
				code = "invalid_node_response"
			} else {
				j.headers = true
			}
		case "data":
			if !j.headers || len(m.Data) == 0 || len(m.Data) > relaywire.MaxChunkBytes {
				code = "invalid_node_response"
			} else {
				j.inflight += int64(len(m.Data))
				j.inflightFrames++
				j.total += int64(len(m.Data))
				if j.inflight > relaywire.InitialWindow || j.inflightFrames > relaywire.MaxInflightFrames {
					code = "node_flow_control_exceeded"
				}
				if j.total > relaywire.MaxResponseBytes {
					code = "response_too_large"
				}
			}
		case "end":
			if !j.headers {
				code = "invalid_node_response"
			}
			j.ended = true
		case "error":
			j.ended = true
		}
	}
	if code == "" {
		j.seq++
		select {
		case j.frames <- m:
		default:
			code = "slow_consumer"
		}
	}
	if code != "" {
		j.code = code
	}
	j.mu.Unlock()
	if code != "" {
		j.cancel()
		j.node.send(relaywire.Message{Type: "cancel", ID: j.id})
	}
}

func (j *job) acknowledge(bytes int) {
	j.mu.Lock()
	j.inflight -= int64(bytes)
	j.inflightFrames--
	j.mu.Unlock()
	j.node.send(relaywire.Message{Type: "ack", ID: j.id, Bytes: int64(bytes)})
}

func validContentType(v string) bool {
	if len(v) > 256 || strings.ContainsAny(v, "\r\n") {
		return false
	}
	t, _, err := mime.ParseMediaType(v)
	return err == nil && (t == "application/json" || t == "text/event-stream" || t == "text/plain" || t == "application/octet-stream")
}

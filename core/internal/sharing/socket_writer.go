package sharing

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"

	"github.com/clovapi/switcher/internal/relaywire"
)

// Each request owns a credit window. A stalled consumer cannot use another
// request's window or block its writes, acknowledgements, or cancellation.
type flowCredit struct {
	mu        sync.Mutex
	available int64
	pending   []int64
	changed   chan struct{}
}

func newFlowCredit() *flowCredit {
	return &flowCredit{available: relaywire.InitialWindow, changed: make(chan struct{}, 1)}
}

func (c *flowCredit) take(ctx context.Context, n int64) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		c.mu.Lock()
		if c.available >= n && len(c.pending) < relaywire.MaxInflightFrames {
			c.available -= n
			c.pending = append(c.pending, n)
			c.mu.Unlock()
			return nil
		}
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-c.changed:
		}
	}
}

func (c *flowCredit) ack(n int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if n <= 0 || len(c.pending) == 0 || c.pending[0] != n {
		return false
	}
	c.pending = c.pending[1:]
	c.available += n
	select {
	case c.changed <- struct{}{}:
	default:
	}
	return true
}

type socketWriter struct {
	session     *nodeConnection
	ctx         context.Context
	cancel      context.CancelFunc
	id          string
	credit      *flowCredit
	header      http.Header
	seq         int
	wroteHeader bool
	written     int
	err         error
}

func (w *socketWriter) Header() http.Header { return w.header }

func (w *socketWriter) send(ctx context.Context, message relaywire.Message) error {
	message.ID, message.Seq = w.id, w.seq
	if err := w.session.send(ctx, message); err != nil {
		return err
	}
	w.seq++
	return nil
}

func (w *socketWriter) WriteHeader(status int) {
	if w.wroteHeader || w.err != nil {
		return
	}
	w.wroteHeader = true
	if status < 100 || status > 599 {
		status = http.StatusBadGateway
	}
	contentType := "application/json"
	if strings.HasPrefix(w.header.Get("Content-Type"), "text/event-stream") {
		contentType = "text/event-stream"
	}
	// Other upstream headers can contain credentials or cookies and stay local.
	w.err = w.send(w.ctx, relaywire.Message{Type: "headers", Status: status, ContentType: contentType})
	if w.err != nil {
		w.cancel()
	}
}

func (w *socketWriter) Write(data []byte) (int, error) {
	if w.err != nil {
		return 0, w.err
	}
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.err != nil {
		return 0, w.err
	}
	if len(data) > relaywire.MaxResponseBytes-w.written {
		w.err = errors.New("shared response exceeds maximum size")
		w.cancel()
		return 0, w.err
	}
	sent := 0
	for len(data) > 0 {
		n := min(len(data), relaywire.MaxChunkBytes)
		if err := w.credit.take(w.ctx, int64(n)); err != nil {
			w.err = err
			return sent, err
		}
		if err := w.send(w.ctx, relaywire.Message{Type: "data", Data: data[:n]}); err != nil {
			w.err = err
			w.cancel()
			return sent, err
		}
		data = data[n:]
		sent += n
		w.written += n
	}
	return sent, nil
}

func (w *socketWriter) Flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
}

func (w *socketWriter) finish(err error) {
	if err == nil {
		err = w.err
	}
	if err == nil {
		err = w.ctx.Err()
	}
	if err != nil {
		// Never send error text: it can contain upstream URLs, keys, or prompts.
		_ = w.send(w.session.ctx, relaywire.Message{Type: "error", Code: "node_error"})
		return
	}
	if !w.wroteHeader {
		w.WriteHeader(http.StatusBadGateway)
	}
	if w.err == nil {
		_ = w.send(w.session.ctx, relaywire.Message{Type: "end"})
	}
}

package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Controller is the Relay admission and accounting boundary. The unified Go
// backend supplies an in-process implementation; HTTPController keeps the old
// split Next.js deployment available during migration.
type Controller interface {
	Apply(context.Context, string, map[string]any) (ControlReply, error)
}

type ControlReply struct {
	OK             bool           `json:"ok"`
	Error          string         `json:"error"`
	NodeID         string         `json:"nodeId"`
	ConsumerID     string         `json:"consumerId"`
	UserID         string         `json:"userId"`
	DailyLimit     int64          `json:"dailyLimit"`
	Used           int64          `json:"used"`
	Paused         bool           `json:"paused"`
	Concurrency    int            `json:"concurrency"`
	CancelIDs      []string       `json:"cancelIds"`
	UsageUpdatedAt string         `json:"usageUpdatedAt"`
	HistorySince   string         `json:"historySince"`
	CatalogModels  []CatalogUsage `json:"models"`
}

type ControlError struct {
	status int
	code   string
}

func NewControlError(status int, code string) error { return &ControlError{status: status, code: code} }
func (e *ControlError) Error() string               { return "relay control plane: " + e.code }
func (e *ControlError) Status() int                 { return e.status }
func (e *ControlError) Code() string                { return e.code }

type controlReply = ControlReply
type controlError = ControlError

type httpController struct {
	url, secret string
	client      *http.Client
}

func (s *Server) control(ctx context.Context, action string, payload map[string]any) (controlReply, error) {
	return s.controller.Apply(ctx, action, payload)
}

func (c *httpController) Apply(ctx context.Context, action string, payload map[string]any) (ControlReply, error) {
	payload["action"] = action
	body, err := json.Marshal(payload)
	if err != nil {
		return ControlReply{}, fmt.Errorf("invalid relay metadata")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return ControlReply{}, fmt.Errorf("invalid control plane URL")
	}
	req.Header.Set("Authorization", "Bearer "+c.secret)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return ControlReply{}, &ControlError{503, "control_plane_unavailable"}
	}
	defer resp.Body.Close()
	var result ControlReply
	limit := int64(64 * 1024)
	if action == "model_catalog_usage" {
		limit = 4 * 1024 * 1024
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, limit)).Decode(&result); err != nil {
		return result, &controlError{503, "control_plane_unavailable"}
	}
	if resp.StatusCode != http.StatusOK || !result.OK {
		code := result.Error
		if code == "" || len(code) > 64 || strings.ContainsAny(code, " \r\n\t") {
			code = "control_plane_unavailable"
		}
		return result, &controlError{resp.StatusCode, code}
	}
	return result, nil
}

type completion struct {
	id, connectionID, state, code string
	status                        int
	bytes                         int64
}

func (s *Server) finish(c completion) {
	// Release the durable reservation before advertising the node slot as free
	// or returning EOF to the consumer. Retries only handle temporary outages.
	_, err := s.control(s.ctx, "complete", map[string]any{"requestId": c.id, "connectionId": c.connectionID, "state": c.state, "status": c.status, "bytes": c.bytes, "errorCode": c.code})
	if err == nil {
		return
	}
	// Every request has a bounded deadline, so an unavailable control plane can
	// expire a reservation even if all completion retries fail.
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.completionClosed {
		return
	}
	s.pendingCompletions.Add(1)
	select {
	case s.completions <- c:
	default:
		s.pendingCompletions.Done()
	}
}

func (s *Server) completionWorker() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			for {
				select {
				case <-s.completions:
					s.pendingCompletions.Done()
				default:
					return
				}
			}
		case c := <-s.completions:
			for attempt := 0; attempt < 3; attempt++ {
				_, err := s.control(s.ctx, "complete", map[string]any{"requestId": c.id, "connectionId": c.connectionID, "state": c.state, "status": c.status, "bytes": c.bytes, "errorCode": c.code})
				if err == nil {
					break
				}
				select {
				case <-s.ctx.Done():
					s.pendingCompletions.Done()
					return
				case <-time.After(time.Duration(attempt+1) * 100 * time.Millisecond):
				}
			}
			s.pendingCompletions.Done()
		}
	}
}

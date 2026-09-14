package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Job struct {
	ID       string          `json:"id"`
	Path     string          `json:"path"`
	Body     json.RawMessage `json:"body"`
	Deadline time.Time       `json:"deadline"`
}

type BindResult struct {
	NodeID     string `json:"nodeId"`
	Model      string `json:"model"`
	DailyLimit int    `json:"dailyLimit"`
	Used       int    `json:"used"`
	Paused     bool   `json:"paused"`
}

type APIError struct {
	Status int
}

func (e *APIError) Error() string { return fmt.Sprintf("platform returned HTTP %d", e.Status) }
func permanent(err error) bool {
	var e *APIError
	return errors.As(err, &e) && (e.Status == 401 || e.Status == 403)
}

type Client struct {
	Platform string
	Key      string
	HTTP     *http.Client
}

func NewClient(platform, key string) *Client {
	return &Client{Platform: platform, Key: key, HTTP: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (c *Client) post(ctx context.Context, path string, body, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Platform+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	if c.Key != "" {
		req.Header.Set("Authorization", "Bearer "+c.Key)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, (5<<20)+1))
	if err != nil {
		return err
	}
	if len(raw) > 5<<20 {
		return errors.New("platform response is too large")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &APIError{Status: resp.StatusCode}
	}
	if out != nil {
		if err = json.Unmarshal(raw, out); err != nil {
			return errors.New("invalid platform JSON response")
		}
	}
	return nil
}

func (c *Client) Bind(ctx context.Context, model string) (BindResult, error) {
	var result BindResult
	err := c.post(ctx, "/api/node/bind", map[string]string{"model": model}, &result)
	if err == nil && (result.NodeID == "" || result.Model != model) {
		err = errors.New("platform binding response does not match the local model")
	}
	return result, err
}

// Package relaywire defines the bounded, multiplexed node relay protocol.
package relaywire

import (
	"encoding/json"
	"time"
)

const (
	Protocol          = 1
	MaxConcurrency    = 5
	InitialWindow     = 256 * 1024
	MaxChunkBytes     = 32 * 1024
	MaxInflightFrames = 32
	MaxRequestBytes   = 512 * 1024
	MaxResponseBytes  = 8 * 1024 * 1024
	RequestTimeout    = 120 * time.Second
	WriteTimeout      = 5 * time.Second
	HeartbeatInterval = 10 * time.Second
	ReadTimeout       = 30 * time.Second
)

// Message carries either control metadata or a chunk of one request. Data is
// base64-encoded by encoding/json; Body is the original JSON request body.
type Message struct {
	Type        string          `json:"type"`
	Protocol    int             `json:"protocol,omitempty"`
	NodeID      string          `json:"nodeId,omitempty"`
	ID          string          `json:"id,omitempty"`
	Seq         int             `json:"seq,omitempty"`
	Models      []string        `json:"models,omitempty"`
	Paused      bool            `json:"paused,omitempty"`
	Remaining   int64           `json:"remaining,omitempty"`
	Concurrency int             `json:"concurrency,omitempty"`
	DailyLimit  int64           `json:"dailyLimit,omitempty"`
	Used        int64           `json:"used,omitempty"`
	Path        string          `json:"path,omitempty"`
	Body        json.RawMessage `json:"body,omitempty"`
	Deadline    time.Time       `json:"deadline,omitempty"`
	Status      int             `json:"status,omitempty"`
	ContentType string          `json:"contentType,omitempty"`
	Data        []byte          `json:"data,omitempty"`
	Code        string          `json:"code,omitempty"`
	Bytes       int64           `json:"bytes,omitempty"`
}

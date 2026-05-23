package protocol

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// Role matches the Electron @typedef IrRole.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleSystem    Role = "system"
	RoleTool      Role = "tool"
)

// Message is the IR chat turn (non-streaming text content only in this slice).
type Message struct {
	Role       Role   `json:"role"`
	Content    string `json:"content"`
	ToolCallID string `json:"tool_call_id,omitempty"`
	Name       string `json:"name,omitempty"`
}

// Tool is the flattened function tool shape used by OpenAI-style encoders.
type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

// Metadata carries cross-style fields (instructions, OAuth subscription flags, hoisted system text).
type Metadata struct {
	System                  string `json:"system,omitempty"`
	Instructions            string `json:"instructions,omitempty"`
	CodexSubscription       bool   `json:"codex_subscription,omitempty"`
	SubscriptionClaudeOAuth bool   `json:"subscription_claude_oauth,omitempty"`
}

// Request is normalized IR consumed by egress encoders.
type Request struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream"`
	Tools       []Tool    `json:"tools,omitempty"`
	MaxTokens   *int      `json:"max_tokens,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	Meta        *Metadata `json:"metadata,omitempty"`
}

// NewRequest returns defaults matching OpenAI-compatible clients (stream defaults false when unset at JSON layer).
func NewRequest(model string, messages []Message, streamDefaultTrue bool, max *int, temp *float64, meta *Metadata) Request {
	return Request{
		Model:       strings.TrimSpace(model),
		Messages:    messages,
		Stream:      streamDefaultTrue,
		Tools:       nil,
		MaxTokens:   max,
		Temperature: temp,
		Meta:        meta,
	}
}

func ensureMeta(r *Request) *Metadata {
	if r.Meta == nil {
		r.Meta = &Metadata{}
	}
	return r.Meta
}

// NormalizeStyle maps user strings to apistyle.Style (alias openai → openai-responses).
func NormalizeStyle(s string) (apistyle.Style, error) {
	return apistyle.Parse(s)
}

// ClaudeAPIMessages returns user/assistant messages only (Claude Messages API wire subset).
func ClaudeAPIMessages(msgs []Message) []Message {
	out := make([]Message, 0, len(msgs))
	for _, m := range msgs {
		switch strings.ToLower(strings.TrimSpace(string(m.Role))) {
		case "user", "assistant":
			out = append(out, m)
		}
	}
	return out
}

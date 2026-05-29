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
	Role    Role   `json:"role"`
	Content string `json:"content"`
	// Parts carries multimodal content (text + image) when the message is not
	// plain text. Content still holds the concatenated text for callers that
	// only need text; encoders consult Parts to preserve images across styles.
	Parts      []ContentPart `json:"parts,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
	Name       string        `json:"name,omitempty"`
}

// ContentPart is a portable multimodal content block within a message.
type ContentPart struct {
	Type  string       `json:"type"` // "text" | "image"
	Text  string       `json:"text,omitempty"`
	Image *ImageSource `json:"image,omitempty"`
}

// ImageSource is a normalized image reference. Either URL (remote or data: URL)
// or inline base64 Data + MediaType is populated.
type ImageSource struct {
	URL       string `json:"url,omitempty"`
	MediaType string `json:"media_type,omitempty"`
	Data      string `json:"data,omitempty"`
}

// Tool is the flattened function tool shape used by OpenAI-style encoders.
type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

// ToolCall is a portable assistant tool invocation (cross-style IR).
type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments,omitempty"` // JSON object string
}

// ToolResult is a portable tool output tied to a prior ToolCall.ID.
type ToolResult struct {
	CallID string `json:"call_id"`
	Output string `json:"output"`
}

// Metadata carries cross-style fields and egress encoding compatibility knobs.
type Metadata struct {
	System                           string `json:"system,omitempty"`
	Instructions                     string `json:"instructions,omitempty"`
	OpenAIResponsesOmitSampling      bool   `json:"openai_responses_omit_sampling,omitempty"`
	ClaudeOAuthEncodingCompatibility bool   `json:"claude_oauth_encoding_compatibility,omitempty"`
	ScrubHermesIdentity              bool   `json:"scrub_hermes_identity,omitempty"`
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
	// InputSlots preserves ordered conversation (messages interleaved with tool calls/results).
	InputSlots []InputSlot `json:"-"`
	// Extensions preserves request-level wire fields not mapped to common IR fields.
	Extensions []ExtensionNode `json:"-"`
}

// NewRequest returns defaults matching agent CLIs (stream defaults true when unset at JSON layer).
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

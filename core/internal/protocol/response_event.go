package protocol

import "fmt"

// ResponseEvent mirrors Electron protocol/ir IrEvent fields used for JSON responses (non-streaming).
type ResponseEvent struct {
	Type string

	Extension *ExtensionNode // wire-preservation node when Type == RespWireExtension

	Text               string // text_delta / errors
	ID                 string // reserve for tool calls
	Name               string
	ArgsFragment       string
	Role               string // message_start assistant
	Model              string // message_start
	Reason             string // finish_reason
	InputTokens        int    // usage
	OutputTokens       int    // usage
	CachedTokens       int    // usage.prompt_tokens_details.cached_tokens
	ReasoningTokens    int    // usage.completion_tokens_details.reasoning_tokens
	HasCachedTokens    bool
	HasReasoningTokens bool
	Message            string // error.message
	Code               string // error.code or Claude error.type
}

// ResponseEventType constants align with Electron IrEvent.type.
const (
	RespWireExtension = "wire_extension"
	RespMessageStart  = "message_start"
	RespTextDelta     = "text_delta"
	RespToolStart     = "tool_call_start"
	RespToolDelta     = "tool_call_delta"
	RespToolEnd       = "tool_call_end"
	RespUsage         = "usage"
	RespFinish        = "finish"
	RespError         = "error"
	UpstreamErrorCode = "upstream_error"
	DecodeFailCode    = "decode_failed"
)

func upstreamHTTPError(status int) ResponseEvent {
	return ResponseEvent{
		Type:    RespError,
		Message: fmt.Sprintf("upstream HTTP %d", status),
		Code:    UpstreamErrorCode,
	}
}

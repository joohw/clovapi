package protocol

import (
	"strconv"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
)

// StreamIngressEncoder wraps style-specific SSE encoders for mirrored downstream relays (Electron encodeSseStream).
type StreamIngressEncoder struct {
	style         apistyle.Style
	claude        *claudeStreamEncoder
	responses     *responsesStreamEncoder
	openAITerm    bool // whether openai-chat encoder halted (terminal error emitted)
	openAIRole    bool
	responsesDead bool // responses SSE error short-circuit
}

// NewStreamIngressEncoder builds an SSE encoder targeting the client's ingress wire shape (Gemini aliases OpenAI Chat).
func NewStreamIngressEncoder(ingress apistyle.Style) *StreamIngressEncoder {
	st := ingressStyleForResponse(ingress)
	e := &StreamIngressEncoder{style: st}
	if st == apistyle.Claude {
		e.claude = newClaudeStreamEncoder()
	}
	if st == apistyle.OpenAIResponses {
		e.responses = newResponsesStreamEncoder()
	}
	return e
}

func (e *StreamIngressEncoder) ensureStyleEncoders() {
	if e.style == apistyle.Claude && e.claude == nil {
		e.claude = newClaudeStreamEncoder()
	}
	if e.style == apistyle.OpenAIResponses && e.responses == nil {
		e.responses = newResponsesStreamEncoder()
	}
}

// EncodeEvent emits zero or more wire chunks for one IR ResponseEvent (call in order until done=true).
func (e *StreamIngressEncoder) EncodeEvent(ev ResponseEvent) (chunks [][]byte, done bool, err error) {
	if ev.Type == RespWireExtension {
		if ev.Extension == nil {
			return nil, false, nil
		}
		if !ExtensionSupportedByIngress(e.style, ev.Extension.Kind) {
			return nil, false, nil
		}
		e.ensureStyleEncoders()
		if e.responses != nil && ev.Extension.Kind == ExtOpenAIResponsesSSEEvent {
			e.responses.wireLifecyclePreserved = true
		}
		if e.claude != nil && ev.Extension.Kind == ExtAnthropicSSEEvent {
			e.claude.wireLifecyclePreserved = true
		}
		replayed, replayErr := replayWireSSEExtension(ev.Extension)
		if replayErr != nil {
			return nil, true, replayErr
		}
		return replayed, false, nil
	}
	switch e.style {
	case apistyle.Claude:
		return e.claude.feed(ev)
	case apistyle.OpenAIChat:
		return e.encodeOpenAIChat(ev)
	case apistyle.OpenAIResponses:
		return e.encodeOpenAIResponses(ev)
	default:
		return nil, false, UnsupportedStreamIngressError{Style: e.style}
	}
}

// FinalizeDrain mirrors trailing OpenAI-chat Responses [DONE] emission after upstream plaintext EOF without explicit SSE EOF semantics.
func (e *StreamIngressEncoder) FinalizeDrain() ([][]byte, error) {
	switch e.style {
	case apistyle.OpenAIChat:
		if e.openAITerm {
			return nil, nil
		}
		return [][]byte{formatOpenAISSEDone()}, nil
	case apistyle.OpenAIResponses:
		if e.responsesDead {
			return nil, nil
		}
		return nil, nil
	default:
		return nil, nil
	}
}

// FinalizeClaudeUpstreamIdle closes dangling Anthropic SSE blocks when upstream plaintext EOF arrives without terminal finish/error events.
func (e *StreamIngressEncoder) FinalizeClaudeUpstreamIdle() ([][]byte, error) {
	if e.style != apistyle.Claude || e.claude == nil {
		return nil, nil
	}
	if e.claude.wireLifecyclePreserved {
		return nil, nil
	}
	return e.claude.finishIfOpen()
}

// FinalizeOpenAIResponsesUpstreamIdle closes dangling Responses SSE blocks when upstream EOF arrives without terminal finish events.
func (e *StreamIngressEncoder) FinalizeOpenAIResponsesUpstreamIdle() ([][]byte, error) {
	if e.style != apistyle.OpenAIResponses || e.responses == nil || e.responsesDead {
		return nil, nil
	}
	if e.responses.wireLifecyclePreserved {
		return nil, nil
	}
	return e.responses.finishIfOpen()
}

func (e *StreamIngressEncoder) encodeOpenAIChat(ev ResponseEvent) ([][]byte, bool, error) {
	if e.openAITerm {
		return nil, true, nil
	}
	id := "chatcmpl-proxy"
	switch ev.Type {
	case RespError:
		bb, err := formatOpenAISSEDataJSON(map[string]any{
			"error": map[string]any{"message": ev.Message, "type": sseOrDefault(ev.Code, "api_error")},
		})
		if err != nil {
			return nil, true, err
		}
		e.openAITerm = true
		return [][]byte{bb, formatOpenAISSEDone()}, true, nil
	case RespMessageStart:
		if !e.openAIRole {
			e.openAIRole = true
			bb, err := formatOpenAISSEDataJSON(map[string]any{
				"id":     id,
				"object": "chat.completion.chunk",
				"model":  strings.TrimSpace(ev.Model),
				"choices": []map[string]any{{
					"index":         0,
					"delta":         map[string]any{"role": string(RoleAssistant)},
					"finish_reason": nil}},
			})
			if err != nil {
				return nil, true, err
			}
			return [][]byte{bb}, false, nil
		}
		return nil, false, nil
	case RespTextDelta:
		if strings.TrimSpace(ev.Text) == "" {
			return nil, false, nil
		}
		bb, err := formatOpenAISSEDataJSON(map[string]any{
			"id":     id,
			"object": "chat.completion.chunk",
			"choices": []map[string]any{{
				"index":         0,
				"delta":         map[string]any{"content": ev.Text},
				"finish_reason": nil}},
		})
		if err != nil {
			return nil, true, err
		}
		return [][]byte{bb}, false, nil
	case RespFinish:
		reason := strings.TrimSpace(ev.Reason)
		if reason == "" {
			reason = "stop"
		}
		bb, err := formatOpenAISSEDataJSON(map[string]any{
			"id":     id,
			"object": "chat.completion.chunk",
			"choices": []map[string]any{{
				"index":         0,
				"delta":         map[string]any{},
				"finish_reason": finishOpenAINormalize(reason),
			}},
		})
		if err != nil {
			return nil, true, err
		}
		return [][]byte{bb}, false, nil
	default:
		return nil, false, nil
	}
}

func (e *StreamIngressEncoder) encodeOpenAIResponses(ev ResponseEvent) ([][]byte, bool, error) {
	if e.responsesDead {
		return nil, true, nil
	}
	if e.responses == nil {
		e.responses = newResponsesStreamEncoder()
	}
	switch ev.Type {
	case RespError:
		bb, err := formatOpenAIResponsesErrorSSE(ev.Message, ev.Code)
		if err != nil {
			return nil, true, err
		}
		e.responsesDead = true
		return [][]byte{bb}, true, nil
	case RespTextDelta:
		if e.responses != nil && e.responses.wireLifecyclePreserved {
			return nil, false, nil
		}
		return e.responses.onTextDelta(ev.Text)
	case RespMessageStart:
		if e.responses != nil && e.responses.wireLifecyclePreserved {
			return nil, false, nil
		}
		return e.responses.onMessageStart(ev.Model)
	case RespFinish:
		if e.responses != nil && e.responses.wireLifecyclePreserved {
			return nil, false, nil
		}
		return e.responses.onFinish()
	case RespToolStart:
		if e.responses != nil && e.responses.wireLifecyclePreserved {
			return nil, false, nil
		}
		return e.responses.onToolStart(ev)
	case RespToolDelta:
		if e.responses != nil && e.responses.wireLifecyclePreserved {
			return nil, false, nil
		}
		return e.responses.onToolDelta(ev)
	case RespToolEnd:
		if e.responses != nil && e.responses.wireLifecyclePreserved {
			return nil, false, nil
		}
		return e.responses.onToolEnd(ev)
	default:
		return nil, false, nil
	}
}

// UnsupportedStreamIngressError indicates an ingress api_style without streaming SSE wiring.
type UnsupportedStreamIngressError struct {
	Style apistyle.Style
}

func (e UnsupportedStreamIngressError) Error() string {
	return `unsupported ingress style for streaming sse encoding: ` + string(e.Style)
}

func sseOrDefault(s, fallback string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	return s
}

// ------ Claude SSE encoder ------

type claudeStreamEncoder struct {
	messageID              string
	model                  string
	started                bool
	blockOpen              bool
	inputTokens            int
	outputTokens           int
	hasUsage               bool
	wireLifecyclePreserved bool
}

func newClaudeStreamEncoder() *claudeStreamEncoder {
	return &claudeStreamEncoder{messageID: newClaudeMessageID()}
}

func newClaudeMessageID() string {
	return "msg_" + strings.ToLower(strconv.FormatInt(time.Now().UnixMilli(), 36))
}

func (c *claudeStreamEncoder) feed(ev ResponseEvent) (chunks [][]byte, done bool, err error) {
	if c.wireLifecyclePreserved {
		switch ev.Type {
		case RespMessageStart, RespTextDelta, RespUsage:
			return nil, false, nil
		case RespFinish:
			return nil, true, nil
		default:
			return nil, false, nil
		}
	}
	switch ev.Type {
	case RespMessageStart:
		if strings.TrimSpace(ev.Model) != "" {
			c.model = strings.TrimSpace(ev.Model)
		}
		return nil, false, nil
	case RespError:
		b, ferr := formatClaudeSSE("error", map[string]any{
			"type": "error",
			"error": map[string]any{
				"type":    sseOrDefault(ev.Code, "api_error"),
				"message": ev.Message,
			},
		})
		if ferr != nil {
			return nil, true, ferr
		}
		return [][]byte{b}, true, nil
	case RespTextDelta:
		cs, ierr := c.ensureStarted()
		if ierr != nil {
			return nil, true, ierr
		}
		chunks := append([][]byte(nil), cs...)
		delta, ferr := formatClaudeSSE("content_block_delta", map[string]any{
			"type":  "content_block_delta",
			"index": 0,
			"delta": map[string]any{"type": "text_delta", "text": ev.Text},
		})
		if ferr != nil {
			return nil, true, ferr
		}
		return append(chunks, delta), false, nil
	case RespUsage:
		if ev.InputTokens != 0 {
			c.inputTokens = ev.InputTokens
		}
		if ev.OutputTokens != 0 {
			c.outputTokens = ev.OutputTokens
		}
		c.hasUsage = c.hasUsage || ev.InputTokens != 0 || ev.OutputTokens != 0
		return nil, false, nil
	case RespFinish:
		cs, ierr := c.ensureStarted()
		if ierr != nil {
			return nil, true, ierr
		}
		chunks := append([][]byte(nil), cs...)
		closeChunks, cerr := c.closeBlocks(finishClaudeNormalize(ev.Reason))
		if cerr != nil {
			return nil, true, cerr
		}
		return append(chunks, closeChunks...), true, nil
	default:
		return nil, false, nil
	}
}

func (c *claudeStreamEncoder) ensureStarted() ([][]byte, error) {
	if c.started {
		return nil, nil
	}
	c.started = true
	c.blockOpen = true
	msPayload := claudeMessageStartPayload(c.messageID, c.model)

	b1, err := formatClaudeSSE("message_start", msPayload)
	if err != nil {
		return nil, err
	}
	b2, err := formatClaudeSSE("content_block_start", map[string]any{
		"type":          "content_block_start",
		"index":         0,
		"content_block": map[string]any{"type": "text", "text": ""},
	})
	if err != nil {
		return nil, err
	}
	return [][]byte{b1, b2}, nil
}

func (c *claudeStreamEncoder) closeBlocks(reason string) ([][]byte, error) {
	if !c.blockOpen {
		return nil, nil
	}
	ch := make([][]byte, 0, 4)

	b3, err := formatClaudeSSE("content_block_stop", map[string]any{
		"type":  "content_block_stop",
		"index": 0,
	})
	if err != nil {
		return nil, err
	}
	ch = append(ch, b3)

	deltaPayload := map[string]any{
		"type":  "message_delta",
		"delta": map[string]any{"stop_reason": strings.TrimSpace(reason)},
	}
	if c.hasUsage {
		deltaPayload["usage"] = map[string]any{"output_tokens": c.outputTokens}
	} else {
		// Hermes Anthropic SDK reads usage.output_tokens from message_delta.
		deltaPayload["usage"] = map[string]any{"output_tokens": 0}
	}
	b4, err := formatClaudeSSE("message_delta", deltaPayload)
	if err != nil {
		return nil, err
	}
	ch = append(ch, b4)

	b5, err := formatClaudeSSE("message_stop", map[string]any{"type": "message_stop"})
	if err != nil {
		return nil, err
	}
	ch = append(ch, b5)
	c.blockOpen = false
	return ch, nil
}

func claudeMessageStartPayload(messageID, model string) map[string]any {
	mm := strings.TrimSpace(model)
	if mm == "" {
		mm = "claude-proxy"
	}
	return map[string]any{
		"type": "message_start",
		"message": map[string]any{
			"id":            messageID,
			"type":          "message",
			"role":          string(RoleAssistant),
			"model":         mm,
			"content":       []map[string]string{},
			"stop_reason":   nil,
			"stop_sequence": nil,
			"usage":         map[string]any{"input_tokens": 0, "output_tokens": 0},
		},
	}
}

func (c *claudeStreamEncoder) finishIfOpen() ([][]byte, error) {
	if c.blockOpen {
		return c.closeBlocks("end_turn")
	}
	if !c.started {
		b, err := formatClaudeSSE("error", map[string]any{
			"type": "error",
			"error": map[string]any{
				"type":    "api_error",
				"message": "empty upstream response",
			},
		})
		if err != nil {
			return nil, err
		}
		return [][]byte{b}, nil
	}
	return nil, nil
}

// ------ OpenAI Responses SSE encoder (Codex wire) ------

type responsesStreamEncoder struct {
	messageID              string
	model                  string
	started                bool
	finished               bool
	textStarted            bool
	textClosed             bool
	textOutputIndex        int
	nextOutputIndex        int
	text                   strings.Builder
	seq                    int
	wireLifecyclePreserved bool
	toolCalls              []*responsesToolCallState
	activeTool             *responsesToolCallState
}

type responsesToolCallState struct {
	ItemID      string
	CallID      string
	Name        string
	Arguments   strings.Builder
	OutputIndex int
}

func newResponsesStreamEncoder() *responsesStreamEncoder {
	return &responsesStreamEncoder{
		messageID: "msg_" + strings.ToLower(strconv.FormatInt(time.Now().UnixMilli(), 36)),
	}
}

func (r *responsesStreamEncoder) nextSeq() int {
	r.seq++
	return r.seq
}

func (r *responsesStreamEncoder) onMessageStart(model string) ([][]byte, bool, error) {
	if strings.TrimSpace(model) != "" {
		r.model = strings.TrimSpace(model)
	}
	if r.started {
		return nil, false, nil
	}
	chunks, err := r.ensureStarted()
	if err != nil {
		return nil, true, err
	}
	return chunks, false, nil
}

func (r *responsesStreamEncoder) onTextDelta(text string) ([][]byte, bool, error) {
	if strings.TrimSpace(text) == "" {
		return nil, false, nil
	}
	started, err := r.ensureTextStarted()
	if err != nil {
		return nil, true, err
	}
	r.text.WriteString(text)
	delta, err := formatOpenAIResponsesDeltaSSE(r.messageID, text, r.nextSeq())
	if err != nil {
		return nil, true, err
	}
	chunks := append([][]byte(nil), started...)
	chunks = append(chunks, delta)
	return chunks, false, nil
}

func (r *responsesStreamEncoder) onFinish() ([][]byte, bool, error) {
	if r.finished {
		return nil, false, nil
	}
	return r.closeStream()
}

func (r *responsesStreamEncoder) onToolStart(ev ResponseEvent) ([][]byte, bool, error) {
	started, err := r.ensureStarted()
	if err != nil {
		return nil, true, err
	}
	chunks := append([][]byte(nil), started...)
	if r.textStarted && !r.textClosed {
		closeText, _, err := r.closeTextItem()
		if err != nil {
			return nil, true, err
		}
		chunks = append(chunks, closeText...)
	}
	name := strings.TrimSpace(ev.Name)
	if name == "" {
		name = "tool"
	}
	tool := &responsesToolCallState{
		ItemID:      responsesFunctionItemID(ev.ID),
		CallID:      responsesToolCallID(ev.ID),
		Name:        name,
		OutputIndex: r.nextOutputIndex,
	}
	r.nextOutputIndex++
	r.toolCalls = append(r.toolCalls, tool)
	r.activeTool = tool
	added, err := formatOpenAIResponsesEventSSE("response.output_item.added", map[string]any{
		"type": "response.output_item.added",
		"item": map[string]any{
			"id":        tool.ItemID,
			"type":      "function_call",
			"status":    "in_progress",
			"call_id":   tool.CallID,
			"name":      tool.Name,
			"arguments": "",
		},
		"output_index":    tool.OutputIndex,
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, true, err
	}
	chunks = append(chunks, added)
	return chunks, false, nil
}

func (r *responsesStreamEncoder) onToolDelta(ev ResponseEvent) ([][]byte, bool, error) {
	if r.activeTool == nil {
		chunks, done, err := r.onToolStart(ResponseEvent{Type: RespToolStart, ID: ev.ID, Name: ev.Name})
		if err != nil || done {
			return chunks, done, err
		}
		extra, done, err := r.onToolDelta(ev)
		return append(chunks, extra...), done, err
	}
	tool := r.activeTool
	fragment := ev.ArgsFragment
	tool.Arguments.WriteString(fragment)
	if fragment == "" {
		return nil, false, nil
	}
	delta, err := formatOpenAIResponsesEventSSE("response.function_call_arguments.delta", map[string]any{
		"type":            "response.function_call_arguments.delta",
		"item_id":         tool.ItemID,
		"output_index":    tool.OutputIndex,
		"delta":           fragment,
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, true, err
	}
	return [][]byte{delta}, false, nil
}

func (r *responsesStreamEncoder) onToolEnd(ev ResponseEvent) ([][]byte, bool, error) {
	tool := r.activeTool
	if tool == nil {
		return nil, false, nil
	}
	args := tool.Arguments.String()
	argsDone, err := formatOpenAIResponsesEventSSE("response.function_call_arguments.done", map[string]any{
		"type":            "response.function_call_arguments.done",
		"item_id":         tool.ItemID,
		"output_index":    tool.OutputIndex,
		"arguments":       args,
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, true, err
	}
	itemDone, err := formatOpenAIResponsesEventSSE("response.output_item.done", map[string]any{
		"type": "response.output_item.done",
		"item": map[string]any{
			"id":        tool.ItemID,
			"type":      "function_call",
			"status":    "completed",
			"call_id":   tool.CallID,
			"name":      tool.Name,
			"arguments": args,
		},
		"output_index":    tool.OutputIndex,
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, true, err
	}
	r.activeTool = nil
	return [][]byte{argsDone, itemDone}, false, nil
}

func (r *responsesStreamEncoder) finishIfOpen() ([][]byte, error) {
	if r.finished {
		return nil, nil
	}
	if r.started || r.text.Len() > 0 || len(r.toolCalls) > 0 {
		chunks, _, err := r.closeStream()
		return chunks, err
	}
	return nil, nil
}

func (r *responsesStreamEncoder) ensureStarted() ([][]byte, error) {
	if r.started {
		return nil, nil
	}
	r.started = true
	model := strings.TrimSpace(r.model)
	if model == "" {
		model = "clovapi-proxy"
	}
	seq := r.nextSeq()
	created, err := formatOpenAIResponsesEventSSE("response.created", map[string]any{
		"type": "response.created",
		"response": map[string]any{
			"id":     "resp_" + r.messageID,
			"object": "response",
			"model":  model,
			"status": "in_progress",
			"output": []any{},
		},
		"sequence_number": seq,
	})
	if err != nil {
		return nil, err
	}
	inProgress, err := formatOpenAIResponsesEventSSE("response.in_progress", map[string]any{
		"type": "response.in_progress",
		"response": map[string]any{
			"id":     "resp_" + r.messageID,
			"object": "response",
			"model":  model,
			"status": "in_progress",
			"output": []any{},
		},
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, err
	}
	return [][]byte{created, inProgress}, nil
}

func (r *responsesStreamEncoder) ensureTextStarted() ([][]byte, error) {
	started, err := r.ensureStarted()
	if err != nil {
		return nil, err
	}
	if r.textStarted {
		return started, nil
	}
	r.textStarted = true
	r.textClosed = false
	r.textOutputIndex = r.nextOutputIndex
	r.nextOutputIndex++
	itemAdded, err := formatOpenAIResponsesEventSSE("response.output_item.added", map[string]any{
		"type": "response.output_item.added",
		"item": map[string]any{
			"id":      r.messageID,
			"type":    "message",
			"status":  "in_progress",
			"content": []any{},
			"role":    string(RoleAssistant),
		},
		"output_index":    r.textOutputIndex,
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, err
	}
	partAdded, err := formatOpenAIResponsesEventSSE("response.content_part.added", map[string]any{
		"type":            "response.content_part.added",
		"content_index":   0,
		"item_id":         r.messageID,
		"output_index":    r.textOutputIndex,
		"sequence_number": r.nextSeq(),
		"part": map[string]any{
			"type":        "output_text",
			"annotations": []any{},
			"logprobs":    []any{},
			"text":        "",
		},
	})
	if err != nil {
		return nil, err
	}
	chunks := append([][]byte(nil), started...)
	chunks = append(chunks, itemAdded, partAdded)
	return chunks, nil
}

func (r *responsesStreamEncoder) closeStream() ([][]byte, bool, error) {
	if r.finished {
		return nil, false, nil
	}
	r.finished = true
	chunks := make([][]byte, 0, 5)
	if r.textStarted && !r.textClosed {
		textChunks, _, err := r.closeTextItem()
		if err != nil {
			return nil, true, err
		}
		chunks = append(chunks, textChunks...)
	}
	model := strings.TrimSpace(r.model)
	if model == "" {
		model = "clovapi-proxy"
	}
	completed, err := formatOpenAIResponsesEventSSE("response.completed", map[string]any{
		"type": "response.completed",
		"response": map[string]any{
			"id":     "resp_" + r.messageID,
			"object": "response",
			"model":  model,
			"status": "completed",
			"output": []any{},
		},
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, true, err
	}
	chunks = append(chunks, completed)
	return chunks, false, nil
}

func (r *responsesStreamEncoder) closeTextItem() ([][]byte, bool, error) {
	if !r.textStarted || r.textClosed {
		return nil, false, nil
	}
	r.textClosed = true
	fullText := r.text.String()
	chunks := make([][]byte, 0, 3)
	textDone, err := formatOpenAIResponsesEventSSE("response.output_text.done", map[string]any{
		"type":            "response.output_text.done",
		"content_index":   0,
		"item_id":         r.messageID,
		"logprobs":        []any{},
		"output_index":    r.textOutputIndex,
		"sequence_number": r.nextSeq(),
		"text":            fullText,
	})
	if err != nil {
		return nil, true, err
	}
	chunks = append(chunks, textDone)
	partDone, err := formatOpenAIResponsesEventSSE("response.content_part.done", map[string]any{
		"type":            "response.content_part.done",
		"content_index":   0,
		"item_id":         r.messageID,
		"output_index":    r.textOutputIndex,
		"sequence_number": r.nextSeq(),
		"part": map[string]any{
			"type":        "output_text",
			"annotations": []any{},
			"logprobs":    []any{},
			"text":        fullText,
		},
	})
	if err != nil {
		return nil, true, err
	}
	chunks = append(chunks, partDone)
	itemDone, err := formatOpenAIResponsesEventSSE("response.output_item.done", map[string]any{
		"type": "response.output_item.done",
		"item": map[string]any{
			"id":     r.messageID,
			"type":   "message",
			"status": "completed",
			"content": []map[string]any{{
				"type":        "output_text",
				"annotations": []any{},
				"logprobs":    []any{},
				"text":        fullText,
			}},
			"role": string(RoleAssistant),
		},
		"output_index":    r.textOutputIndex,
		"sequence_number": r.nextSeq(),
	})
	if err != nil {
		return nil, true, err
	}
	chunks = append(chunks, itemDone)
	return chunks, false, nil
}

func responsesToolCallID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "call_" + strings.ToLower(strconv.FormatInt(time.Now().UnixNano(), 36))
	}
	if strings.HasPrefix(id, "call_") {
		return id
	}
	return "call_" + id
}

func responsesFunctionItemID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "fc_" + strings.ToLower(strconv.FormatInt(time.Now().UnixNano(), 36))
	}
	if strings.HasPrefix(id, "fc_") {
		return id
	}
	return "fc_" + id
}

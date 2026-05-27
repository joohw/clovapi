package protocol

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// SSEUpstreamDecodeState tracks partial decoder state across SSE records (Electron async generator locals).
type SSEUpstreamDecodeState struct {
	OpenAIChatStarted     bool
	ResponsesStarted      bool
	ResponsesHasTextDelta bool // incremental output_text.delta already forwarded
	ClaudeBlocks          map[int]*claudeSSEBlockState
	ResponsesTools        map[string]*responsesSSEToolState
}

type claudeSSEBlockState struct {
	Type string
	ID   string
	Name string
}

type responsesSSEToolState struct {
	ID       string
	Name     string
	Args     strings.Builder
	SawDelta bool
}

// DecodeSSEStreamRecord maps one parsed SSE wire record into normalized ResponseEvent slices using egress SSE semantics (Electron decodeSseStream per style).
func DecodeSSEStreamRecord(egress apistyle.Style, rec SSERecord, st *SSEUpstreamDecodeState) []ResponseEvent {
	style := egressStyleForResponse(egress)
	if st == nil {
		st = &SSEUpstreamDecodeState{}
	}
	switch style {
	case apistyle.Claude:
		return decodeClaudeSSERecord(rec, st)
	case apistyle.OpenAIChat:
		return decodeOpenAIChatSSERecord(rec, &st.OpenAIChatStarted)
	case apistyle.OpenAIResponses:
		return decodeOpenAIResponsesSSERecord(rec, st)
	default:
		return nil
	}
}

func decodeClaudeSSERecord(rec SSERecord, st *SSEUpstreamDecodeState) []ResponseEvent {
	if strings.TrimSpace(rec.Data) == "[DONE]" {
		return nil
	}
	payload, ok := sseJSONPayload(rec.Data)
	if !ok {
		return nil
	}
	if sseIsClaudeWireError(payload) {
		em := sseClaudeErrorEnvelope(payload)
		if strings.TrimSpace(em.Message) == "" {
			em.Message = "upstream error"
		}
		return []ResponseEvent{em}
	}
	if evs := decodeClaudeStreamPayload(rec, payload, st); len(evs) > 0 {
		return evs
	}
	return []ResponseEvent{wireExtension(ExtAnthropicSSEEvent, rec)}
}

func decodeClaudeStreamPayload(rec SSERecord, payload map[string]any, st *SSEUpstreamDecodeState) []ResponseEvent {
	if payload == nil {
		return nil
	}
	switch strings.TrimSpace(fmt.Sprint(payload["type"])) {
	case "message_start":
		model := ""
		if msg, ok := payload["message"].(map[string]any); ok && msg != nil {
			model = strings.TrimSpace(fmt.Sprint(msg["model"]))
		}
		return []ResponseEvent{
			wireExtension(ExtAnthropicSSEEvent, rec),
			{Type: RespMessageStart, Role: string(RoleAssistant), Model: model},
		}
	case "content_block_start":
		evs := []ResponseEvent{wireExtension(ExtAnthropicSSEEvent, rec)}
		index, ok := ssePayloadIndex(payload)
		if !ok {
			return evs
		}
		block, _ := payload["content_block"].(map[string]any)
		if block == nil {
			return evs
		}
		typ := strings.TrimSpace(fmt.Sprint(block["type"]))
		if st.ClaudeBlocks == nil {
			st.ClaudeBlocks = map[int]*claudeSSEBlockState{}
		}
		st.ClaudeBlocks[index] = &claudeSSEBlockState{
			Type: typ,
			ID:   strings.TrimSpace(fmt.Sprint(block["id"])),
			Name: strings.TrimSpace(fmt.Sprint(block["name"])),
		}
		if typ == "tool_use" {
			evs = append(evs, ResponseEvent{
				Type: RespToolStart,
				ID:   st.ClaudeBlocks[index].ID,
				Name: st.ClaudeBlocks[index].Name,
			})
		}
		return evs
	case "content_block_delta":
		evs := []ResponseEvent{wireExtension(ExtAnthropicSSEEvent, rec)}
		index, _ := ssePayloadIndex(payload)
		block := (*claudeSSEBlockState)(nil)
		if st.ClaudeBlocks != nil {
			block = st.ClaudeBlocks[index]
		}
		if block != nil && block.Type == "tool_use" {
			if args := sseClaudeDeltaPartialJSON(payload); args != "" {
				evs = append(evs, ResponseEvent{Type: RespToolDelta, ID: block.ID, Name: block.Name, ArgsFragment: args})
			}
			return evs
		}
		if text := sseClaudeDeltaText(payload); text != "" {
			evs = append(evs, ResponseEvent{Type: RespTextDelta, Text: text})
		}
		return evs
	case "content_block_stop":
		evs := []ResponseEvent{wireExtension(ExtAnthropicSSEEvent, rec)}
		index, ok := ssePayloadIndex(payload)
		if !ok || st.ClaudeBlocks == nil {
			return evs
		}
		block := st.ClaudeBlocks[index]
		delete(st.ClaudeBlocks, index)
		if block != nil && block.Type == "tool_use" {
			evs = append(evs, ResponseEvent{Type: RespToolEnd, ID: block.ID, Name: block.Name})
		}
		return evs
	case "message_delta":
		evs := []ResponseEvent{wireExtension(ExtAnthropicSSEEvent, rec)}
		if inTok, outTok, ok := sseUsageTokens(payload["usage"]); ok {
			evs = append(evs, ResponseEvent{Type: RespUsage, InputTokens: inTok, OutputTokens: outTok})
		}
		if dm, ok := payload["delta"].(map[string]any); ok && dm != nil {
			if sr := strings.TrimSpace(fmt.Sprint(dm["stop_reason"])); sr != "" {
				evs = append(evs, ResponseEvent{Type: RespFinish, Reason: sr})
			}
		}
		return evs
	case "message_stop":
		return []ResponseEvent{wireExtension(ExtAnthropicSSEEvent, rec), {Type: RespFinish, Reason: "end_turn"}}
	default:
		return nil
	}
}

func sseIsClaudeWireError(payload map[string]any) bool {
	t := strings.EqualFold(strings.TrimSpace(fmt.Sprint(payload["type"])), "error")
	return t || payload["error"] != nil
}

func sseClaudeErrorEnvelope(payload map[string]any) ResponseEvent {
	em := envelopeError(payload["error"])
	code := strings.TrimSpace(em.code)
	msg := strings.TrimSpace(em.message)
	if code == "" {
		code = strings.TrimSpace(fmt.Sprint(payload["type"]))
	}
	return ResponseEvent{
		Type:    RespError,
		Message: msg,
		Code:    code,
	}
}

func sseClaudeDeltaText(payload map[string]any) string {
	delta, ok := payload["delta"].(map[string]any)
	if !ok || delta == nil {
		return ""
	}
	txt := delta["text"]
	if txt != nil && fmt.Sprint(txt) != "<nil>" {
		return fmt.Sprint(txt)
	}
	return ""
}

func sseClaudeDeltaPartialJSON(payload map[string]any) string {
	delta, ok := payload["delta"].(map[string]any)
	if !ok || delta == nil {
		return ""
	}
	if pj := delta["partial_json"]; pj != nil && fmt.Sprint(pj) != "<nil>" {
		return fmt.Sprint(pj)
	}
	return ""
}

func ssePayloadIndex(payload map[string]any) (int, bool) {
	if payload == nil {
		return 0, false
	}
	if n, ok := coerceIntPointer(payload["index"]); ok && n != nil {
		return *n, true
	}
	return 0, false
}

func decodeOpenAIChatSSERecord(rec SSERecord, started *bool) []ResponseEvent {
	if strings.TrimSpace(rec.Data) == "[DONE]" {
		return []ResponseEvent{{Type: RespFinish, Reason: "stop"}}
	}
	payload, ok := sseJSONPayload(rec.Data)
	if !ok {
		return nil
	}
	out := []ResponseEvent{}
	if errObj, ok := payload["error"].(map[string]any); ok && errObj != nil {
		em := envelopeError(errObj)
		msg := strings.TrimSpace(em.message)
		if msg == "" {
			msg = "upstream error"
		}
		return []ResponseEvent{{Type: RespError, Message: msg, Code: strings.TrimSpace(em.code)}}
	}
	if !*started {
		*started = true
		out = append(out, ResponseEvent{Type: RespMessageStart, Role: string(RoleAssistant), Model: strings.TrimSpace(fmt.Sprint(payload["model"]))})
	}
	if choices, ok := payload["choices"].([]any); ok && len(choices) > 0 {
		cm, _ := choices[0].(map[string]any)
		if cm != nil {
			if dm, ok := cm["delta"].(map[string]any); ok && dm != nil {
				if ct := strings.TrimSpace(fmt.Sprint(dm["content"])); ct != "" {
					out = append(out, ResponseEvent{Type: RespTextDelta, Text: ct})
				}
			}
			if fr := strings.TrimSpace(fmt.Sprint(cm["finish_reason"])); fr != "" {
				out = append(out, ResponseEvent{Type: RespFinish, Reason: fr})
			}
		}
	}
	return out
}

func decodeOpenAIResponsesSSERecord(rec SSERecord, st *SSEUpstreamDecodeState) []ResponseEvent {
	if st == nil {
		st = &SSEUpstreamDecodeState{}
	}
	if strings.TrimSpace(rec.Data) == "[DONE]" {
		return []ResponseEvent{{Type: RespFinish, Reason: "completed"}}
	}
	payload, ok := sseJSONPayload(rec.Data)
	if !ok {
		return nil
	}
	out := []ResponseEvent{}
	if errObj, ok := payload["error"].(map[string]any); ok && errObj != nil {
		em := envelopeError(errObj)
		msg := strings.TrimSpace(em.message)
		if msg == "" {
			msg = "upstream error"
		}
		return []ResponseEvent{{Type: RespError, Message: msg, Code: strings.TrimSpace(em.code)}}
	}
	recordType := strings.TrimSpace(strings.ToLower(fmt.Sprint(payload["type"])))
	if recordType == "" && strings.TrimSpace(rec.Event) != "" {
		recordType = strings.TrimSpace(strings.ToLower(rec.Event))
	}
	if failed := responsesIsFailed(payload, recordType); failed != nil {
		return []ResponseEvent{*failed}
	}
	if isResponsesWirePreservationEvent(recordType) {
		if strings.Contains(recordType, "response") {
			st.ResponsesStarted = true
		}
		rec = normalizeOpenAIResponsesSSERecord(recordType, payload, rec)
		ev := wireExtension(ExtOpenAIResponsesSSEEvent, rec)
		toolEvents := responsesToolEventsFromWire(recordType, payload, st)
		if recordType == "response.completed" || strings.TrimSpace(fmt.Sprint(payload["status"])) == "completed" {
			if inTok, outTok, ok := sseUsageTokens(responsesUsageMap(payload)); ok {
				out := append([]ResponseEvent{ev}, toolEvents...)
				out = append(out, ResponseEvent{Type: RespUsage, InputTokens: inTok, OutputTokens: outTok}, ResponseEvent{Type: RespFinish, Reason: "completed"})
				return out
			}
			out := append([]ResponseEvent{ev}, toolEvents...)
			out = append(out, ResponseEvent{Type: RespFinish, Reason: "completed"})
			return out
		}
		return append([]ResponseEvent{ev}, toolEvents...)
	}
	if strings.Contains(recordType, "output_text.delta") || strings.Contains(recordType, "text.delta") {
		txt := responsesExtractDeltaText(payload)
		ev := wireExtension(ExtOpenAIResponsesSSEEvent, rec)
		if txt != "" {
			st.ResponsesHasTextDelta = true
			return []ResponseEvent{ev, {Type: RespTextDelta, Text: txt}}
		}
		return []ResponseEvent{ev}
	}
	return out
}

func normalizeOpenAIResponsesSSERecord(recordType string, payload map[string]any, rec SSERecord) SSERecord {
	if payload == nil {
		return rec
	}
	if !isResponsesWirePreservationEvent(recordType) && strings.TrimSpace(fmt.Sprint(payload["status"])) != "completed" {
		return rec
	}
	changed := false
	changed = normalizeResponsesArrayFields(payload) || changed
	if !changed {
		return rec
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return rec
	}
	rec.Data = string(data)
	return rec
}

func responsesToolEventsFromWire(recordType string, payload map[string]any, st *SSEUpstreamDecodeState) []ResponseEvent {
	if payload == nil || st == nil {
		return nil
	}
	if st.ResponsesTools == nil {
		st.ResponsesTools = map[string]*responsesSSEToolState{}
	}
	switch recordType {
	case "response.output_item.added":
		item, _ := payload["item"].(map[string]any)
		if strings.TrimSpace(fmt.Sprint(item["type"])) != "function_call" {
			return nil
		}
		itemID := strings.TrimSpace(fmt.Sprint(item["id"]))
		if itemID == "" {
			return nil
		}
		callID := strings.TrimSpace(fmt.Sprint(item["call_id"]))
		if callID == "" {
			callID = itemID
		}
		name := strings.TrimSpace(fmt.Sprint(item["name"]))
		st.ResponsesTools[itemID] = &responsesSSEToolState{ID: callID, Name: name}
		return []ResponseEvent{{Type: RespToolStart, ID: callID, Name: name}}
	case "response.function_call_arguments.delta":
		itemID := strings.TrimSpace(fmt.Sprint(payload["item_id"]))
		tool := st.ResponsesTools[itemID]
		if tool == nil {
			return nil
		}
		fragment := fmt.Sprint(payload["delta"])
		if fragment == "<nil>" {
			fragment = ""
		}
		tool.Args.WriteString(fragment)
		tool.SawDelta = true
		if fragment == "" {
			return nil
		}
		return []ResponseEvent{{Type: RespToolDelta, ID: tool.ID, Name: tool.Name, ArgsFragment: fragment}}
	case "response.function_call_arguments.done":
		itemID := strings.TrimSpace(fmt.Sprint(payload["item_id"]))
		tool := st.ResponsesTools[itemID]
		if tool == nil || tool.SawDelta {
			return nil
		}
		args := strings.TrimSpace(fmt.Sprint(payload["arguments"]))
		if args == "" || args == "<nil>" {
			return nil
		}
		tool.Args.WriteString(args)
		return []ResponseEvent{{Type: RespToolDelta, ID: tool.ID, Name: tool.Name, ArgsFragment: args}}
	case "response.output_item.done":
		item, _ := payload["item"].(map[string]any)
		if strings.TrimSpace(fmt.Sprint(item["type"])) != "function_call" {
			return nil
		}
		itemID := strings.TrimSpace(fmt.Sprint(item["id"]))
		tool := st.ResponsesTools[itemID]
		if tool == nil {
			callID := strings.TrimSpace(fmt.Sprint(item["call_id"]))
			if callID == "" {
				callID = itemID
			}
			tool = &responsesSSEToolState{ID: callID, Name: strings.TrimSpace(fmt.Sprint(item["name"]))}
		}
		var out []ResponseEvent
		if !tool.SawDelta && tool.Args.Len() == 0 {
			args := strings.TrimSpace(fmt.Sprint(item["arguments"]))
			if args != "" && args != "<nil>" {
				out = append(out, ResponseEvent{Type: RespToolDelta, ID: tool.ID, Name: tool.Name, ArgsFragment: args})
			}
		}
		out = append(out, ResponseEvent{Type: RespToolEnd, ID: tool.ID, Name: tool.Name})
		delete(st.ResponsesTools, itemID)
		return out
	default:
		return nil
	}
}

func normalizeResponsesArrayFields(value any) bool {
	obj, ok := value.(map[string]any)
	if !ok || obj == nil {
		return false
	}
	changed := false
	if isResponsesResponseObject(obj) {
		if _, exists := obj["output"]; !exists {
			obj["output"] = []any{}
			changed = true
		}
	}
	for _, key := range []string{"output", "content", "annotations", "logprobs"} {
		if _, exists := obj[key]; exists && obj[key] == nil {
			obj[key] = []any{}
			changed = true
		}
	}
	for _, key := range []string{"response", "item", "part"} {
		if child, ok := obj[key].(map[string]any); ok && child != nil {
			changed = normalizeResponsesArrayFields(child) || changed
		}
	}
	for _, key := range []string{"output", "content"} {
		items, ok := obj[key].([]any)
		if !ok {
			continue
		}
		for _, item := range items {
			changed = normalizeResponsesArrayFields(item) || changed
		}
	}
	return changed
}

func isResponsesResponseObject(obj map[string]any) bool {
	if strings.TrimSpace(fmt.Sprint(obj["object"])) == "response" {
		return true
	}
	if _, hasStatus := obj["status"]; !hasStatus {
		return false
	}
	if _, hasModel := obj["model"]; hasModel {
		return true
	}
	_, hasUsage := obj["usage"]
	return hasUsage
}

func responsesUsageMap(payload map[string]any) any {
	if payload == nil {
		return nil
	}
	if um := payload["usage"]; um != nil {
		return um
	}
	if rsp, ok := payload["response"].(map[string]any); ok && rsp != nil {
		return rsp["usage"]
	}
	return nil
}

func sseUsageTokens(usageAny any) (inTok, outTok int, ok bool) {
	um, okMap := usageAny.(map[string]any)
	if !okMap || um == nil {
		return 0, 0, false
	}
	if n, okIn := coerceIntPointer(um["input_tokens"]); okIn {
		inTok = *n
	} else if n, okIn := coerceIntPointer(um["prompt_tokens"]); okIn {
		inTok = *n
	}
	if n, okOut := coerceIntPointer(um["output_tokens"]); okOut {
		outTok = *n
	} else if n, okOut := coerceIntPointer(um["completion_tokens"]); okOut {
		outTok = *n
	}
	return inTok, outTok, inTok != 0 || outTok != 0
}

func responsesIsFailed(payload map[string]any, recordType string) *ResponseEvent {
	if strings.Contains(recordType, "failed") || strings.TrimSpace(fmt.Sprint(payload["status"])) == "failed" {
		msg := ""
		code := ""
		if rsp, ok := payload["response"].(map[string]any); ok && rsp != nil {
			if nested, ok := rsp["error"].(map[string]any); ok && nested != nil {
				em := envelopeError(nested)
				msg, code = em.message, em.code
			}
		}
		if strings.TrimSpace(msg) == "" {
			if nested, ok := payload["error"].(map[string]any); ok && nested != nil {
				em := envelopeError(nested)
				msg, code = em.message, em.code
			}
		}
		if strings.TrimSpace(msg) == "" {
			msg = "upstream failed"
		}
		return &ResponseEvent{Type: RespError, Message: strings.TrimSpace(msg), Code: strings.TrimSpace(code)}
	}
	return nil
}

func responsesExtractDeltaText(payload map[string]any) string {
	if d, ok := payload["delta"]; ok {
		switch v := d.(type) {
		case string:
			return v
		case map[string]any:
			if v == nil {
				return ""
			}
			for _, k := range []string{"text", "content", "value"} {
				if s := strings.TrimSpace(fmt.Sprint(v[k])); s != "" {
					return s
				}
			}
			return ""
		default:
			return strings.TrimSpace(fmt.Sprint(v))
		}
	}
	for _, k := range []string{"text", "output_text"} {
		if s := strings.TrimSpace(fmt.Sprint(payload[k])); s != "" {
			return s
		}
	}
	return ""
}

func responsesExtractResponseText(v any) string {
	raw, ok := v.(map[string]any)
	if !ok || raw == nil {
		return ""
	}
	items, ok := raw["output"].([]any)
	if !ok {
		return ""
	}
	txt := ""
	for _, item := range items {
		im, ok := item.(map[string]any)
		if !ok || im == nil || strings.TrimSpace(fmt.Sprint(im["type"])) != "message" {
			continue
		}
		txt += TextContent(im["content"])
	}
	return txt
}

func isResponsesWirePreservationEvent(recordType string) bool {
	recordType = strings.TrimSpace(strings.ToLower(recordType))
	switch recordType {
	case "response.created", "response.in_progress", "response.completed",
		"response.output_item.added", "response.output_item.done",
		"response.content_part.added", "response.content_part.done",
		"response.output_text.done",
		"response.function_call_arguments.delta", "response.function_call_arguments.done":
		return true
	default:
		return false
	}
}

func sseJSONPayload(data string) (map[string]any, bool) {
	data = strings.TrimSpace(data)
	if data == "" {
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(data), &payload); err != nil || payload == nil {
		return nil, false
	}
	return payload, true
}

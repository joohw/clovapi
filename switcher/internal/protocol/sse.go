package protocol

import (
	"bytes"
	"encoding/json"
	"strings"
)

// SSERecord is one logical Server-Sent Event after joining multiline data: fields (Electron protocol/sse.parseSseChunk).
type SSERecord struct {
	Event string
	Data  string
}

// SSEParseState retains partial SSE bytes across chunked reads (\n\n delimited frames).
type SSEParseState struct {
	buffer []byte
}

// AppendParse feeds raw UTF-8 (decompressed plaintext) into the SSE parser state and returns any complete SSE records (mirrors Electron parseSseChunk).
func AppendParse(chunk []byte, st *SSEParseState) []SSERecord {
	if st == nil {
		return nil
	}
	if len(chunk) > 0 {
		st.buffer = append(st.buffer, chunk...)
	}
	idx := bytes.Index(st.buffer, []byte("\n\n"))
	if idx < 0 {
		return nil
	}
	out := []SSERecord{}
	for idx >= 0 {
		block := st.buffer[:idx]
		st.buffer = append([]byte(nil), st.buffer[idx+2:]...)
		rec, ok := parseSSEBlock(block)
		if ok {
			out = append(out, rec)
		}
		idx = bytes.Index(st.buffer, []byte("\n\n"))
	}
	return out
}

// FlushSSEParseState emits one trailing SSE record when upstream plaintext EOF arrives without a final blank line.
func FlushSSEParseState(st *SSEParseState) []SSERecord {
	if st == nil || len(bytes.TrimSpace(st.buffer)) == 0 {
		return nil
	}
	block := st.buffer
	st.buffer = nil
	rec, ok := parseSSEBlock(block)
	if !ok {
		return nil
	}
	return []SSERecord{rec}
}

func parseSSEBlock(block []byte) (SSERecord, bool) {
	if len(bytes.TrimSpace(block)) == 0 {
		return SSERecord{}, false
	}
	event := "message"
	var dataLines []string
	for _, lineRaw := range bytes.Split(block, []byte{'\n'}) {
		line := string(lineRaw)
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}
		// SSE comment / heartbeat lines
		if strings.HasPrefix(line, ":") {
			continue
		}
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}
		if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimLeft(strings.TrimPrefix(line, "data:"), " \t"))
		}
	}
	if len(dataLines) == 0 {
		return SSERecord{}, false
	}
	return SSERecord{Event: event, Data: strings.Join(dataLines, "\n")}, true
}

func formatOpenAISSEDataJSON(payload any) ([]byte, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("data: ")
	buf.Write(b)
	buf.WriteString("\n\n")
	return buf.Bytes(), nil
}

func formatOpenAISSEDone() []byte {
	return []byte("data: [DONE]\n\n")
}

func formatClaudeSSE(event string, payload any) ([]byte, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("event: ")
	buf.WriteString(event)
	buf.WriteString("\ndata: ")
	buf.Write(b)
	buf.WriteString("\n\n")
	return buf.Bytes(), nil
}

func formatOpenAIResponsesErrorSSE(message, code string) ([]byte, error) {
	if strings.TrimSpace(code) == "" {
		code = "api_error"
	}
	payload := map[string]any{
		"error": map[string]any{
			"message": message,
			"type":    code,
		},
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("event: error\ndata: ")
	buf.Write(b)
	buf.WriteString("\n\n")
	return buf.Bytes(), nil
}

func formatOpenAIResponsesEventSSE(eventType string, payload map[string]any) ([]byte, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("event: ")
	buf.WriteString(eventType)
	buf.WriteString("\ndata: ")
	buf.Write(b)
	buf.WriteString("\n\n")
	return buf.Bytes(), nil
}

func formatOpenAIResponsesCreatedSSE(model string) ([]byte, error) {
	resp := map[string]any{
		"id":     "resp_proxy",
		"object": "response",
		"status": "in_progress",
		"output": []any{},
	}
	if m := strings.TrimSpace(model); m != "" {
		resp["model"] = m
	}
	return formatOpenAIResponsesEventSSE("response.created", map[string]any{
		"type":     "response.created",
		"response": resp,
	})
}

func formatOpenAIResponsesDeltaSSE(itemID, text string, sequenceNumber int) ([]byte, error) {
	payload := map[string]any{
		"type":            "response.output_text.delta",
		"content_index":   0,
		"delta":           text,
		"item_id":         itemID,
		"logprobs":        []any{},
		"output_index":    0,
		"sequence_number": sequenceNumber,
	}
	return formatOpenAIResponsesEventSSE("response.output_text.delta", payload)
}

func formatOpenAIResponsesCompletedSSE() []byte {
	b, _ := formatOpenAIResponsesEventSSE("response.completed", map[string]any{
		"type":   "response.completed",
		"status": "completed",
	})
	return b
}

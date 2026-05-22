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

func formatOpenAIResponsesDeltaSSE(text string) ([]byte, error) {
	payload := map[string]any{
		"type":  "response.output_text.delta",
		"delta": text,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("event: response.output_text.delta\ndata: ")
	buf.Write(b)
	buf.WriteString("\n\n")
	return buf.Bytes(), nil
}

func formatOpenAIResponsesCompletedSSE() []byte {
	return []byte("event: response.completed\ndata: {\"type\":\"response.completed\",\"status\":\"completed\"}\n\n")
}

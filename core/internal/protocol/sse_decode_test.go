package protocol

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestDecodeOpenAIResponsesCompletedNormalizesNullOutput(t *testing.T) {
	rec := SSERecord{
		Event: "response.completed",
		Data:  `{"type":"response.completed","response":{"id":"resp_test","status":"completed","output":null,"usage":{"input_tokens":5,"output_tokens":3}}}`,
	}

	var st SSEUpstreamDecodeState
	events := DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st)
	if len(events) == 0 || events[0].Type != RespWireExtension || events[0].Extension == nil {
		t.Fatalf("first event = %#v, want preserved wire extension", events)
	}

	var wire WireSSEPayload
	if err := json.Unmarshal(events[0].Extension.Payload, &wire); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(wire.Data), &payload); err != nil {
		t.Fatal(err)
	}
	response, _ := payload["response"].(map[string]any)
	output, ok := response["output"].([]any)
	if !ok {
		t.Fatalf("response.output = %#v, want []", response["output"])
	}
	if len(output) != 0 {
		t.Fatalf("response.output len = %d, want 0", len(output))
	}
	if _, ok := response["usage"].(map[string]any); !ok {
		t.Fatalf("response.usage was not preserved: %#v", response["usage"])
	}
}

func TestResponsesCompletedToOpenAIChatChunkPreservesUsageDetails(t *testing.T) {
	rec := SSERecord{
		Event: "response.completed",
		Data: `{"type":"response.completed","response":{
			"id":"resp_test",
			"status":"completed",
			"output":[],
			"usage":{
				"input_tokens":1226,
				"output_tokens":5,
				"total_tokens":1231,
				"input_tokens_details":{"cached_tokens":1024},
				"output_tokens_details":{"reasoning_tokens":0}
			}
		}}`,
	}

	var dec SSEUpstreamDecodeState
	enc := NewStreamIngressEncoder(apistyle.OpenAIChat)
	var raw strings.Builder
	for _, ev := range DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &dec) {
		chunks, _, err := enc.EncodeEvent(ev)
		if err != nil {
			t.Fatal(err)
		}
		for _, chunk := range chunks {
			raw.Write(chunk)
		}
	}
	got := raw.String()
	for _, want := range []string{
		`"prompt_tokens":1226`,
		`"completion_tokens":5`,
		`"total_tokens":1231`,
		`"prompt_tokens_details":{"cached_tokens":1024}`,
		`"completion_tokens_details":{"reasoning_tokens":0}`,
		`"finish_reason":"stop"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("chat completion chunk missing %s in %s", want, got)
		}
	}
}

func TestDecodeOpenAIResponsesCompletedAddsMissingOutput(t *testing.T) {
	rec := SSERecord{
		Event: "response.completed",
		Data:  `{"type":"response.completed","response":{"id":"resp_test","object":"response","status":"completed","usage":{"input_tokens":5,"output_tokens":3}}}`,
	}

	var st SSEUpstreamDecodeState
	events := DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st)
	if len(events) == 0 || events[0].Type != RespWireExtension || events[0].Extension == nil {
		t.Fatalf("first event = %#v, want preserved wire extension", events)
	}

	var wire WireSSEPayload
	if err := json.Unmarshal(events[0].Extension.Payload, &wire); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(wire.Data), &payload); err != nil {
		t.Fatal(err)
	}
	response, _ := payload["response"].(map[string]any)
	output, ok := response["output"].([]any)
	if !ok {
		t.Fatalf("response.output = %#v, want []", response["output"])
	}
	if len(output) != 0 {
		t.Fatalf("response.output len = %d, want 0", len(output))
	}
}

func TestDecodeOpenAIResponsesWireEventsNormalizeNullIterableFields(t *testing.T) {
	rec := SSERecord{
		Event: "response.output_item.done",
		Data:  `{"type":"response.output_item.done","response":{"status":"in_progress","output":null},"item":{"type":"message","content":null},"part":{"type":"output_text","annotations":null,"logprobs":null,"text":"ok"}}`,
	}

	var st SSEUpstreamDecodeState
	events := DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st)
	if len(events) != 1 || events[0].Type != RespWireExtension || events[0].Extension == nil {
		t.Fatalf("events = %#v, want one preserved wire extension", events)
	}

	var wire WireSSEPayload
	if err := json.Unmarshal(events[0].Extension.Payload, &wire); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(wire.Data), &payload); err != nil {
		t.Fatal(err)
	}

	response, _ := payload["response"].(map[string]any)
	if output, ok := response["output"].([]any); !ok || len(output) != 0 {
		t.Fatalf("response.output = %#v, want []", response["output"])
	}
	item, _ := payload["item"].(map[string]any)
	if content, ok := item["content"].([]any); !ok || len(content) != 0 {
		t.Fatalf("item.content = %#v, want []", item["content"])
	}
	part, _ := payload["part"].(map[string]any)
	if annotations, ok := part["annotations"].([]any); !ok || len(annotations) != 0 {
		t.Fatalf("part.annotations = %#v, want []", part["annotations"])
	}
	if logprobs, ok := part["logprobs"].([]any); !ok || len(logprobs) != 0 {
		t.Fatalf("part.logprobs = %#v, want []", part["logprobs"])
	}
}

func TestDecodeOpenAIResponsesPreservesFunctionCallArgumentEvents(t *testing.T) {
	records := []SSERecord{
		{
			Event: "response.function_call_arguments.delta",
			Data:  `{"type":"response.function_call_arguments.delta","delta":"{\"command\"","item_id":"fc_test","output_index":0,"sequence_number":3}`,
		},
		{
			Event: "response.function_call_arguments.done",
			Data:  `{"type":"response.function_call_arguments.done","arguments":"{\"command\":\"date\"}","item_id":"fc_test","output_index":0,"sequence_number":4}`,
		},
	}
	var st SSEUpstreamDecodeState
	enc := NewStreamIngressEncoder(apistyle.OpenAIResponses)
	var raw strings.Builder
	for _, rec := range records {
		for _, ev := range DecodeSSEStreamRecord(apistyle.OpenAIResponses, rec, &st) {
			chunks, _, err := enc.EncodeEvent(ev)
			if err != nil {
				t.Fatal(err)
			}
			for _, chunk := range chunks {
				raw.Write(chunk)
			}
		}
	}
	got := raw.String()
	for _, want := range []string{
		`event: response.function_call_arguments.delta`,
		`event: response.function_call_arguments.done`,
		`"delta":"{\"command\""`,
		`"arguments":"{\"command\":\"date\"}"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("replayed Responses tool argument event missing %s in %s", want, got)
		}
	}
}

func TestClaudeToolUseStreamsAsOpenAIResponsesFunctionCall(t *testing.T) {
	records := []SSERecord{
		{Event: "message_start", Data: `{"type":"message_start","message":{"model":"claude-opus-4-6","role":"assistant","content":[]}}`},
		{Event: "content_block_start", Data: `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"准备执行"}}`},
		{Event: "content_block_stop", Data: `{"type":"content_block_stop","index":0}`},
		{Event: "content_block_start", Data: `{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_test","name":"exec_command","input":{}}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\""}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":":\"pwd\"}"}}`},
		{Event: "content_block_stop", Data: `{"type":"content_block_stop","index":1}`},
		{Event: "message_delta", Data: `{"type":"message_delta","delta":{"stop_reason":"tool_use"}}`},
	}

	var dec SSEUpstreamDecodeState
	enc := NewStreamIngressEncoder(apistyle.OpenAIResponses)
	var raw string
	for _, rec := range records {
		for _, ev := range DecodeSSEStreamRecord(apistyle.Claude, rec, &dec) {
			if ev.Type == RespWireExtension {
				continue
			}
			chunks, _, err := enc.EncodeEvent(ev)
			if err != nil {
				t.Fatal(err)
			}
			for _, chunk := range chunks {
				raw += string(chunk)
			}
		}
	}

	for _, want := range []string{
		`"type":"function_call"`,
		`"type":"response.function_call_arguments.delta"`,
		`"type":"response.function_call_arguments.done"`,
		`"call_id":"call_toolu_test"`,
		`"name":"exec_command"`,
		`"arguments":"{\"cmd\":\"pwd\"}"`,
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("encoded Responses SSE missing %s in %s", want, raw)
		}
	}
	if strings.Contains(raw, `"text":"{\"cmd\""`) {
		t.Fatalf("tool arguments leaked as output text: %s", raw)
	}
	textDoneAt := strings.Index(raw, `"type":"response.output_text.done"`)
	toolAddedAt := strings.Index(raw, `"type":"function_call"`)
	if textDoneAt < 0 || toolAddedAt < 0 || textDoneAt > toolAddedAt {
		t.Fatalf("text item must close before function_call starts: %s", raw)
	}
}

func TestClaudeTextThenToolUseDateCommand(t *testing.T) {
	records := []SSERecord{
		{Event: "message_start", Data: `{"type":"message_start","message":{"model":"claude-opus-4-6","id":"msg_019LjV1ENVMZRLZiPx2J5h8G","type":"message","role":"assistant","content":[]}}`},
		{Event: "content_block_start", Data: `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\n\n可"}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"以，我能调用工具。让我查一下现在的时间："}}`},
		{Event: "content_block_stop", Data: `{"type":"content_block_stop","index":0}`},
		{Event: "content_block_start", Data: `{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_019LRUnqKs7UJAyuQFMkVPj9","name":"exec_command","input":{},"caller":{"type":"direct"}}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\": \""}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"date"}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" '+%Y-%m-"}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"%d %H:%M:%S "}}`},
		{Event: "content_block_delta", Data: `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"%Z'\"}"}}`},
		{Event: "content_block_stop", Data: `{"type":"content_block_stop","index":1}`},
		{Event: "message_delta", Data: `{"type":"message_delta","delta":{"stop_reason":"tool_use"}}`},
	}

	var dec SSEUpstreamDecodeState
	enc := NewStreamIngressEncoder(apistyle.OpenAIResponses)
	var raw string
	var toolStart, toolDelta, toolEnd int
	for _, rec := range records {
		for _, ev := range DecodeSSEStreamRecord(apistyle.Claude, rec, &dec) {
			switch ev.Type {
			case RespToolStart:
				toolStart++
			case RespToolDelta:
				toolDelta++
			case RespToolEnd:
				toolEnd++
			case RespWireExtension:
				continue
			}
			chunks, _, err := enc.EncodeEvent(ev)
			if err != nil {
				t.Fatal(err)
			}
			for _, chunk := range chunks {
				raw += string(chunk)
			}
		}
	}
	if toolStart != 1 || toolDelta != 5 || toolEnd != 1 {
		t.Fatalf("tool event counts start=%d delta=%d end=%d", toolStart, toolDelta, toolEnd)
	}
	for _, want := range []string{
		`"type":"function_call"`,
		`"name":"exec_command"`,
		`"call_id":"call_toolu_019LRUnqKs7UJAyuQFMkVPj9"`,
		`"arguments":"{\"cmd\": \"date '+%Y-%m-%d %H:%M:%S %Z'\"}"`,
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("encoded Responses SSE missing %s in %s", want, raw)
		}
	}
	textDoneAt := strings.Index(raw, `"type":"response.output_text.done"`)
	toolAddedAt := strings.Index(raw, `"type":"function_call"`)
	if textDoneAt < 0 || toolAddedAt < 0 || textDoneAt > toolAddedAt {
		t.Fatalf("text item must close before function_call starts: %s", raw)
	}
	if !strings.Contains(raw, `response.function_call_arguments.delta`) ||
		!strings.Contains(raw, `response.function_call_arguments.done`) {
		t.Fatalf("bridge should match native Codex function_call argument events, got %s", raw)
	}
}

func TestTooldefFixturesDecodeEncode(t *testing.T) {
	claudeReq := readProtocolTestdata(t, "requests/claude-request-with-tooldef.json")
	claudeIR, err := DecodeRequestClaude(claudeReq)
	if err != nil {
		t.Fatal(err)
	}
	if len(claudeIR.Tools) != 1 || claudeIR.Tools[0].Name != "update_plan" {
		t.Fatalf("claude tools = %#v, want update_plan", claudeIR.Tools)
	}
	encodedClaude, err := EncodeRequestClaude(claudeIR)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encodedClaude), `"tools"`) ||
		!strings.Contains(string(encodedClaude), `"input_schema"`) ||
		!strings.Contains(string(encodedClaude), `"update_plan"`) {
		t.Fatalf("encoded Claude request lost tool definition: %s", encodedClaude)
	}

	codexReq := readProtocolTestdata(t, "requests/codex-request-with-tooldef.json")
	codexIR, err := DecodeRequestOpenAIResponses(codexReq)
	if err != nil {
		t.Fatal(err)
	}
	if len(codexIR.Tools) != 1 || codexIR.Tools[0].Name != "update_plan" {
		t.Fatalf("codex tools = %#v, want update_plan", codexIR.Tools)
	}
	encodedCodex, err := EncodeRequestOpenAIResponses(codexIR)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"tools"`, `"parameters"`, `"update_plan"`, `"input"`} {
		if !strings.Contains(string(encodedCodex), want) {
			t.Fatalf("encoded Codex request missing %s: %s", want, encodedCodex)
		}
	}

	claudeRecords := parseProtocolSSEFixture(t, "sse/claude-response-with-tooldef.sse")
	claudeAsCodex := encodeDecodedSSE(t, apistyle.Claude, apistyle.OpenAIResponses, claudeRecords, true)
	for _, want := range []string{
		`"type":"function_call"`,
		`"type":"response.function_call_arguments.delta"`,
		`"type":"response.function_call_arguments.done"`,
		`"type":"response.output_item.done"`,
		`"name":"update_plan"`,
	} {
		if !strings.Contains(claudeAsCodex, want) {
			t.Fatalf("Claude fixture encoded to Responses missing %s in %s", want, claudeAsCodex)
		}
	}
	if strings.Index(claudeAsCodex, `"type":"response.output_text.done"`) >
		strings.Index(claudeAsCodex, `"type":"function_call"`) {
		t.Fatalf("text item must close before function_call starts: %s", claudeAsCodex)
	}

	codexFixtureRaw := string(readProtocolTestdata(t, "sse/codex-response-with-tooldef.sse"))
	codexRecords := parseProtocolSSEFixture(t, "sse/codex-response-with-tooldef.sse")
	codexReplay := encodeDecodedSSE(t, apistyle.OpenAIResponses, apistyle.OpenAIResponses, codexRecords, false)
	for _, want := range []string{
		`"type":"function_call"`,
		`"type":"response.output_item.done"`,
		`"name":"update_plan"`,
	} {
		if !strings.Contains(codexReplay, want) {
			t.Fatalf("Codex fixture replay missing %s in %s", want, codexReplay)
		}
	}
	for _, optionalWire := range []string{
		`"type":"response.function_call_arguments.delta"`,
		`"type":"response.function_call_arguments.done"`,
	} {
		if strings.Contains(codexFixtureRaw, optionalWire) && !strings.Contains(codexReplay, optionalWire) {
			t.Fatalf("Codex fixture replay missing fixture wire event %s in %s", optionalWire, codexReplay)
		}
	}
}

func TestLongCodexResponsesFixtureEncodesClaudeToolUse(t *testing.T) {
	req := readProtocolTestdata(t, "requests/codex-to-claude-long-request-with-tools.json")
	ir, err := DecodeRequestClaude(req)
	if err != nil {
		t.Fatal(err)
	}
	if len(ir.Tools) == 0 {
		t.Fatalf("long Claude ingress fixture has no tools")
	}

	records := parseProtocolSSEFixture(t, "sse/codex-to-claude-long-upstream-response.sse")
	claudeRaw := encodeDecodedSSE(t, apistyle.OpenAIResponses, apistyle.Claude, records, false)
	for _, want := range []string{
		`"type":"tool_use"`,
		`"type":"input_json_delta"`,
		`"name":"Shell"`,
		`"partial_json":"{\"command\"`,
		`"stop_reason":"tool_use"`,
	} {
		if !strings.Contains(claudeRaw, want) {
			t.Fatalf("Codex long fixture encoded to Claude missing %s in %s", want, claudeRaw)
		}
	}
	if strings.Contains(claudeRaw, `response.function_call_arguments`) {
		t.Fatalf("Responses wire events leaked into Claude output: %s", claudeRaw)
	}
}

func readProtocolTestdata(t *testing.T, rel string) []byte {
	t.Helper()
	body, err := os.ReadFile("testdata/" + rel)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func parseProtocolSSEFixture(t *testing.T, rel string) []SSERecord {
	t.Helper()
	body := readProtocolTestdata(t, rel)
	parseSt := SSEParseState{}
	records := AppendParse(body, &parseSt)
	records = append(records, FlushSSEParseState(&parseSt)...)
	if len(records) == 0 {
		t.Fatalf("%s parsed no SSE records", rel)
	}
	return records
}

func encodeDecodedSSE(t *testing.T, egress, ingress apistyle.Style, records []SSERecord, skipWireExtensions bool) string {
	t.Helper()
	var dec SSEUpstreamDecodeState
	enc := NewStreamIngressEncoder(ingress)
	var raw strings.Builder
	for _, rec := range records {
		for _, ev := range DecodeSSEStreamRecord(egress, rec, &dec) {
			if skipWireExtensions && ev.Type == RespWireExtension {
				continue
			}
			chunks, _, err := enc.EncodeEvent(ev)
			if err != nil {
				t.Fatal(err)
			}
			for _, chunk := range chunks {
				raw.Write(chunk)
			}
		}
	}
	return raw.String()
}

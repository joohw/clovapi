package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// ExtractCallLogTokenUsage normalizes provider token usage from logged upstream
// response bodies. It supports OpenAI Responses/Chat and Anthropic Messages
// shapes, including SSE terminal events.
func ExtractCallLogTokenUsage(body string) *CallLogTokenUsage {
	text := strings.TrimSpace(body)
	if text == "" {
		return nil
	}
	var usage CallLogTokenUsage
	found := false
	for _, payload := range callLogUsagePayloads(text) {
		if mergeCallLogPayloadUsage(&usage, payload) {
			found = true
		}
	}
	if !found {
		return nil
	}
	if usage.TotalTokens == 0 && (usage.InputTokens > 0 || usage.OutputTokens > 0) {
		usage.TotalTokens = usage.InputTokens + usage.OutputTokens
	}
	return &usage
}

// ExtractCallLogToolCallCount counts tool calls emitted by the upstream model
// response. It supports common OpenAI Responses/Chat, Anthropic Messages, and
// Gemini function-call shapes, including SSE terminal events.
func ExtractCallLogToolCallCount(body string) int {
	text := strings.TrimSpace(body)
	if text == "" {
		return 0
	}
	ids := map[string]struct{}{}
	anonymous := 0
	for _, payload := range callLogUsagePayloads(text) {
		anonymous += collectCallLogPayloadToolCalls(payload, ids)
	}
	return len(ids) + anonymous
}

func callLogUsagePayloads(text string) []map[string]any {
	var out []map[string]any
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		if payload, ok := decodeCallLogTokenUsageJSON([]byte(text)); ok {
			out = append(out, payload)
		}
	}
	for _, rec := range parseCallLogSSEResponse([]byte(text)) {
		if strings.TrimSpace(rec.Data) == "" || strings.TrimSpace(rec.Data) == "[DONE]" {
			continue
		}
		if payload, ok := decodeCallLogTokenUsageJSON([]byte(rec.Data)); ok {
			out = append(out, payload)
		}
	}
	return out
}

func decodeCallLogTokenUsageJSON(raw []byte) (map[string]any, bool) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var payload map[string]any
	if err := dec.Decode(&payload); err != nil || payload == nil {
		return nil, false
	}
	return payload, true
}

func mergeCallLogPayloadUsage(target *CallLogTokenUsage, payload map[string]any) bool {
	if target == nil || payload == nil {
		return false
	}
	found := false
	if mergeCallLogTokenUsageObject(target, asUsageMap(payload["usage"])) {
		found = true
	}
	if mergeCallLogTokenUsageObject(target, asUsageMap(payload["usageMetadata"])) {
		found = true
	}
	if response, _ := payload["response"].(map[string]any); response != nil {
		if mergeCallLogTokenUsageObject(target, asUsageMap(response["usage"])) {
			found = true
		}
		if mergeCallLogTokenUsageObject(target, asUsageMap(response["usageMetadata"])) {
			found = true
		}
	}
	if message, _ := payload["message"].(map[string]any); message != nil {
		if mergeCallLogTokenUsageObject(target, asUsageMap(message["usage"])) {
			found = true
		}
	}
	return found
}

func countCallLogPayloadToolCalls(payload map[string]any) int {
	ids := map[string]struct{}{}
	anonymous := collectCallLogPayloadToolCalls(payload, ids)
	return len(ids) + anonymous
}

func collectCallLogPayloadToolCalls(payload map[string]any, ids map[string]struct{}) int {
	if payload == nil {
		return 0
	}
	count := collectCallLogToolCallsInObject(payload, ids)
	if item, _ := payload["item"].(map[string]any); item != nil {
		count += collectCallLogToolCallsInObject(item, ids)
	}
	if block, _ := payload["content_block"].(map[string]any); block != nil {
		count += collectCallLogToolCallsInObject(block, ids)
	}
	if response, _ := payload["response"].(map[string]any); response != nil {
		count += collectCallLogToolCallsInObject(response, ids)
	}
	if message, _ := payload["message"].(map[string]any); message != nil {
		count += collectCallLogToolCallsInObject(message, ids)
	}
	return count
}

func countCallLogToolCallsInObject(obj map[string]any) int {
	ids := map[string]struct{}{}
	return collectCallLogToolCallsInObject(obj, ids)
}

func collectCallLogToolCallsInObject(obj map[string]any, ids map[string]struct{}) int {
	if obj == nil {
		return 0
	}
	count := 0
	if isCallLogToolCallObject(obj) {
		if key := callLogToolCallKey(obj); key != "" {
			ids[key] = struct{}{}
		} else {
			count++
		}
	}
	if calls, ok := obj["tool_calls"].([]any); ok {
		count += collectCallLogToolCallsInArray(calls, ids)
	}
	if call, ok := obj["function_call"].(map[string]any); ok && len(call) > 0 {
		if key := callLogToolCallKey(call); key != "" {
			ids[key] = struct{}{}
		} else {
			count++
		}
	}
	count += collectCallLogToolCallsInArray(obj["output"], ids)
	count += collectCallLogToolCallsInArray(obj["content"], ids)
	count += collectCallLogToolCallsInChoices(obj["choices"], ids)
	count += collectCallLogToolCallsInCandidates(obj["candidates"], ids)
	return count
}

func countCallLogToolCallsInChoices(raw any) int {
	ids := map[string]struct{}{}
	return collectCallLogToolCallsInChoices(raw, ids)
}

func collectCallLogToolCallsInChoices(raw any, ids map[string]struct{}) int {
	choices, ok := raw.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, choice := range choices {
		obj, _ := choice.(map[string]any)
		if obj == nil {
			continue
		}
		if message, _ := obj["message"].(map[string]any); message != nil {
			count += collectCallLogToolCallsInObject(message, ids)
		}
		if delta, _ := obj["delta"].(map[string]any); delta != nil {
			count += collectCallLogToolCallsInObject(delta, ids)
		}
	}
	return count
}

func countCallLogToolCallsInCandidates(raw any) int {
	ids := map[string]struct{}{}
	return collectCallLogToolCallsInCandidates(raw, ids)
}

func collectCallLogToolCallsInCandidates(raw any, ids map[string]struct{}) int {
	candidates, ok := raw.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, candidate := range candidates {
		obj, _ := candidate.(map[string]any)
		content, _ := obj["content"].(map[string]any)
		count += collectCallLogToolCallsInArray(content["parts"], ids)
	}
	return count
}

func countCallLogToolCallsInArray(raw any) int {
	ids := map[string]struct{}{}
	return collectCallLogToolCallsInArray(raw, ids)
}

func collectCallLogToolCallsInArray(raw any, ids map[string]struct{}) int {
	items, ok := raw.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, item := range items {
		obj, _ := item.(map[string]any)
		if obj == nil {
			continue
		}
		count += collectCallLogToolCallsInObject(obj, ids)
	}
	return count
}

func isCallLogToolCallObject(obj map[string]any) bool {
	typ := strings.ToLower(strings.TrimSpace(fmt.Sprint(obj["type"])))
	return typ == "function_call" || typ == "tool_call" || typ == "tool_use" || strings.HasSuffix(typ, "_tool_call") || strings.HasSuffix(typ, "_call") && strings.Contains(typ, "tool")
}

func callLogToolCallKey(obj map[string]any) string {
	for _, key := range []string{"id", "call_id", "tool_call_id"} {
		value := strings.TrimSpace(fmt.Sprint(obj[key]))
		if value != "" && value != "<nil>" {
			return value
		}
	}
	return ""
}

func asUsageMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func mergeCallLogTokenUsageObject(target *CallLogTokenUsage, usage map[string]any) bool {
	if target == nil || usage == nil {
		return false
	}
	found := false
	if assignUsageMax(&target.InputTokens, usage["input_tokens"], usage["prompt_tokens"], usage["promptTokenCount"]) {
		found = true
	}
	if assignUsageMax(&target.OutputTokens, usage["output_tokens"], usage["completion_tokens"], usage["candidatesTokenCount"]) {
		found = true
	}
	if assignUsageMax(&target.TotalTokens, usage["total_tokens"], usage["totalTokenCount"]) {
		found = true
	}
	if assignUsageMax(&target.CacheReadTokens, usage["cache_read_input_tokens"], usage["cachedContentTokenCount"]) {
		found = true
	}
	if assignUsageMax(&target.CacheCreationTokens, usage["cache_creation_input_tokens"]) {
		found = true
	}
	if assignUsageMax(&target.ReasoningTokens, usage["thoughtsTokenCount"]) {
		found = true
	}
	if details := asUsageMap(usage["input_tokens_details"]); details != nil {
		if assignUsageMax(&target.CacheReadTokens, details["cached_tokens"]) {
			found = true
		}
	}
	if details := asUsageMap(usage["prompt_tokens_details"]); details != nil {
		if assignUsageMax(&target.CacheReadTokens, details["cached_tokens"]) {
			found = true
		}
	}
	if details := asUsageMap(usage["output_tokens_details"]); details != nil {
		if assignUsageMax(&target.ReasoningTokens, details["reasoning_tokens"], details["thinking_tokens"]) {
			found = true
		}
	}
	if details := asUsageMap(usage["completion_tokens_details"]); details != nil {
		if assignUsageMax(&target.ReasoningTokens, details["reasoning_tokens"], details["thinking_tokens"]) {
			found = true
		}
	}
	return found
}

func assignUsageMax(target *int, values ...any) bool {
	changed := false
	for _, v := range values {
		n, ok := callLogUsageInt(v)
		if !ok {
			continue
		}
		if n > *target {
			*target = n
		}
		changed = true
	}
	return changed
}

func callLogUsageInt(v any) (int, bool) {
	switch x := v.(type) {
	case json.Number:
		i, err := x.Int64()
		if err == nil && i >= 0 {
			return int(i), true
		}
		f, err := x.Float64()
		if err == nil && f >= 0 {
			return int(f), true
		}
	case float64:
		if x >= 0 {
			return int(x), true
		}
	case int:
		if x >= 0 {
			return x, true
		}
	case int64:
		if x >= 0 {
			return int(x), true
		}
	}
	return 0, false
}

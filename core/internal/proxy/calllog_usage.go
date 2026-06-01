package proxy

import (
	"bytes"
	"encoding/json"
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
		if assignUsageMax(&target.ReasoningTokens, details["reasoning_tokens"]) {
			found = true
		}
	}
	if details := asUsageMap(usage["completion_tokens_details"]); details != nil {
		if assignUsageMax(&target.ReasoningTokens, details["reasoning_tokens"]) {
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

package protocol

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
)

const (
	claudeOAuthSystemBootstrap   = "You are Claude Code, Anthropic's official CLI for Claude."
	claudeOAuthMaxOutputTokens   = 8192
	defaultClaudeOAuthBillingHdr = "x-anthropic-billing-header: cc_version=2.1.126; cc_entrypoint=cli; cch=6c6d5;"
)

func claudeOAuthBillingHeader() string {
	if v := strings.TrimSpace(os.Getenv("ANTHROPIC_BILLING_HEADER")); v != "" {
		return v
	}
	return defaultClaudeOAuthBillingHdr
}

func stripClaudeOAuthBillingText(system string) string {
	hdr := claudeOAuthBillingHeader()
	system = strings.ReplaceAll(system, hdr, "")
	return strings.TrimSpace(system)
}

func claudeOAuthUserIDJSON() string {
	hostname, _ := os.Hostname()
	sum := sha256.Sum256([]byte("clovapi-" + strings.TrimSpace(hostname)))
	payload := map[string]string{
		"device_id":    hex.EncodeToString(sum[:]),
		"account_uuid": "clovapi",
		"session_id":   uuid.NewString(),
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

func applyClaudeOAuthBilling(payload map[string]any, systemText string) {
	billing := claudeOAuthBillingHeader()
	blocks := []map[string]any{{"type": "text", "text": billing}}

	systemText = stripClaudeOAuthBillingText(systemText)
	if systemText != "" {
		blocks = append(blocks, map[string]any{"type": "text", "text": systemText})
	}
	payload["system"] = blocks

	meta, _ := payload["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	if strings.TrimSpace(fmtString(meta["user_id"])) == "" {
		meta["user_id"] = claudeOAuthUserIDJSON()
	}
	payload["metadata"] = meta
}

// EncodeClaudeOAuthCompatibleRawRequest keeps Claude Messages wire fields while
// still applying proxy-owned routing policy.
func EncodeClaudeOAuthCompatibleRawRequest(body []byte, r Request) ([]byte, error) {
	payload, err := jsonDecodeMap(body)
	if err != nil {
		return nil, fmt.Errorf("decode claude oauth request: %w", err)
	}
	payload["model"] = strings.TrimSpace(r.Model)
	payload["stream"] = r.Stream

	maxTok := 1024
	if r.MaxTokens != nil {
		maxTok = *r.MaxTokens
	} else if n, ok := coerceIntPointer(payload["max_tokens"]); ok && n != nil {
		maxTok = *n
	}
	if maxTok > claudeOAuthMaxOutputTokens {
		maxTok = claudeOAuthMaxOutputTokens
	}
	payload["max_tokens"] = maxTok

	system := CollectSystemPrompt(r)
	system = stripClaudeOAuthBillingText(system)
	if system != "" && !strings.Contains(system, claudeOAuthSystemBootstrap) {
		system = claudeOAuthSystemBootstrap + "\n\n" + system
	} else if system == "" {
		system = claudeOAuthSystemBootstrap
	}
	applyClaudeOAuthBilling(payload, system)

	return json.Marshal(payload)
}

func fmtString(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	default:
		return strings.TrimSpace(jsonString(v))
	}
}

func jsonString(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func claudeToolsPayload(tools []Tool) []map[string]any {
	if len(tools) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(tools))
	for _, t := range tools {
		schema := t.Parameters
		if schema == nil {
			schema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		item := map[string]any{
			"name":         t.Name,
			"input_schema": schema,
		}
		if d := strings.TrimSpace(t.Description); d != "" {
			item["description"] = d
		}
		out = append(out, item)
	}
	return out
}

func mapClaudeTools(raw any) ([]Tool, error) {
	arr, ok := raw.([]any)
	if !ok || len(arr) == 0 {
		return nil, nil
	}
	out := make([]Tool, 0, len(arr))
	for _, item := range arr {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if fn, ok := entry["function"].(map[string]any); ok && fn != nil {
			entry = fn
		}
		name := strings.TrimSpace(fmt.Sprint(entry["name"]))
		if name == "" {
			continue
		}
		t := Tool{Name: name}
		if d, ok := entry["description"].(string); ok {
			t.Description = d
		}
		switch {
		case entry["input_schema"] != nil:
			if p, ok := entry["input_schema"].(map[string]any); ok && p != nil {
				t.Parameters = p
			}
		case entry["parameters"] != nil:
			if p, ok := entry["parameters"].(map[string]any); ok && p != nil {
				t.Parameters = p
			}
		}
		if t.Parameters == nil {
			t.Parameters = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		out = append(out, t)
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

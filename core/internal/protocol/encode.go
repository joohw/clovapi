package protocol

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// EncodeRequestClaude maps IR to Anthropic Messages API JSON.
func EncodeRequestClaude(r Request) ([]byte, error) {
	maxTok := 1024
	if r.MaxTokens != nil {
		maxTok = *r.MaxTokens
	}
	if r.Meta != nil && r.Meta.ClaudeOAuthEncodingCompatibility && maxTok > claudeOAuthMaxOutputTokens {
		maxTok = claudeOAuthMaxOutputTokens
	}
	var messagesWire any
	if len(r.InputSlots) > 0 {
		messagesWire = claudeMessagesWireFromInputSlots(r.InputSlots)
	} else {
		messagesWire = cmPayload(ClaudeAPIMessages(r.Messages))
	}
	payload := map[string]any{
		"model":      r.Model,
		"max_tokens": maxTok,
		"messages":   messagesWire,
		"stream":     true,
	}
	if r.Temperature != nil {
		payload["temperature"] = *r.Temperature
	}
	if tools := claudeToolsPayload(r.Tools); len(tools) > 0 {
		payload["tools"] = tools
	}
	system := CollectSystemPrompt(r)
	if r.Meta != nil && r.Meta.ClaudeOAuthEncodingCompatibility {
		system = stripClaudeOAuthBillingText(system)
		if system != "" && !strings.Contains(system, claudeOAuthSystemBootstrap) {
			system = claudeOAuthSystemBootstrap + "\n\n" + system
		} else if system == "" {
			system = claudeOAuthSystemBootstrap
		}
		applyClaudeOAuthBilling(payload, system)
	} else if system != "" {
		payload["system"] = system
	}
	if err := applyRequestFieldExtensions(payload, r.Extensions, ExtAnthropicRequestField); err != nil {
		return nil, err
	}
	return json.Marshal(payload)
}

func cmPayload(msgs []Message) []map[string]string {
	out := make([]map[string]string, 0, len(msgs))
	for _, m := range msgs {
		item := map[string]string{
			"role":    strings.ToLower(string(m.Role)),
			"content": m.Content,
		}
		out = append(out, item)
	}
	return out
}

// EncodeRequestOpenAIChat maps IR to POST /chat/completions JSON.
func EncodeRequestOpenAIChat(r Request) ([]byte, error) {
	var msgs []map[string]any
	if len(r.InputSlots) > 0 {
		msgs = openAIChatMessagesFromInputSlots(r.InputSlots)
	} else {
		msgs = make([]map[string]any, 0, len(r.Messages))
		for _, m := range r.Messages {
			msg := map[string]any{"role": string(m.Role), "content": m.Content}
			if strings.TrimSpace(m.ToolCallID) != "" {
				msg["tool_call_id"] = m.ToolCallID
			}
			if strings.TrimSpace(m.Name) != "" {
				msg["name"] = m.Name
			}
			msgs = append(msgs, msg)
		}
	}
	body := map[string]any{
		"model":    r.Model,
		"messages": msgs,
		"stream":   true,
	}
	if r.MaxTokens != nil {
		body["max_tokens"] = *r.MaxTokens
	}
	if r.Temperature != nil {
		body["temperature"] = *r.Temperature
	}
	if len(r.Tools) > 0 {
		tools := make([]map[string]any, 0, len(r.Tools))
		for _, t := range r.Tools {
			params := t.Parameters
			if params == nil {
				params = map[string]any{"type": "object", "properties": map[string]any{}}
			}
			tools = append(tools, map[string]any{
				"type": "function",
				"function": map[string]any{
					"name":        t.Name,
					"description": t.Description,
					"parameters":  params,
				},
			})
		}
		body["tools"] = tools
	}
	return json.Marshal(body)
}

// EncodeRequestOpenAIResponses maps IR to Responses API JSON (non-streaming fields only slice).
func EncodeRequestOpenAIResponses(r Request) ([]byte, error) {
	input := responsesInputWireFromIR(r)
	instructions := CollectSystemPrompt(r)
	if r.Meta != nil {
		if extra := strings.TrimSpace(r.Meta.Instructions); extra != "" {
			if instructions != "" {
				instructions = instructions + "\n\n" + extra
			} else {
				instructions = extra
			}
		}
	}
	body := map[string]any{
		"model":        r.Model,
		"input":        input,
		"stream":       true,
		"store":        false,
		"instructions": instructions,
	}
	omitSampling := r.Meta != nil && r.Meta.OpenAIResponsesOmitSampling
	if r.MaxTokens != nil && !omitSampling {
		body["max_output_tokens"] = *r.MaxTokens
	}
	if r.Temperature != nil && !omitSampling {
		body["temperature"] = *r.Temperature
	}
	if len(r.Tools) > 0 {
		tools := make([]any, 0, len(r.Tools))
		for _, t := range r.Tools {
			params := t.Parameters
			if params == nil {
				params = map[string]any{"type": "object", "properties": map[string]any{}}
			}
			tools = append(tools, map[string]any{
				"type":        "function",
				"name":        t.Name,
				"description": t.Description,
				"parameters":  params,
			})
		}
		body["tools"] = tools
	}
	if err := applyRequestFieldExtensions(body, r.Extensions, ExtOpenAIResponsesRequestField); err != nil {
		return nil, err
	}
	return json.Marshal(body)
}

func responsesMessageContentType(role Role) string {
	switch strings.ToLower(strings.TrimSpace(string(role))) {
	case string(RoleAssistant):
		return "output_text"
	default:
		return "input_text"
	}
}

// EncodeRequestGemini uses the OpenAI Chat wire shape (Electron gemini encoder re-exports openai-chat).
func EncodeRequestGemini(r Request) ([]byte, error) {
	return EncodeRequestOpenAIChat(r)
}

// DecodeRequestGemini decodes like OpenAI Chat (Electron gemini decoder re-exports openai-chat).
func DecodeRequestGemini(body []byte) (Request, error) {
	return DecodeRequestOpenAIChat(body)
}

// EncodeRequestForStyle dispatches to the egress encoder.
func EncodeRequestForStyle(egress apistyle.Style, r Request) ([]byte, error) {
	if err := ValidateRequestExtensionsForEgress(egress, r); err != nil {
		return nil, err
	}
	switch egress {
	case apistyle.Claude:
		return EncodeRequestClaude(r)
	case apistyle.OpenAIChat, apistyle.Gemini:
		if egress == apistyle.Gemini {
			return EncodeRequestGemini(r)
		}
		return EncodeRequestOpenAIChat(r)
	case apistyle.OpenAIResponses:
		return EncodeRequestOpenAIResponses(r)
	default:
		return nil, fmt.Errorf("unsupported egress style %q", egress)
	}
}

// DecodeRequestForStyle decodes an ingress body to IR.
func DecodeRequestForStyle(ingress apistyle.Style, body []byte) (Request, error) {
	switch ingress {
	case apistyle.Claude:
		return DecodeRequestClaude(body)
	case apistyle.OpenAIChat, apistyle.Gemini:
		if ingress == apistyle.Gemini {
			return DecodeRequestGemini(body)
		}
		return DecodeRequestOpenAIChat(body)
	case apistyle.OpenAIResponses:
		return DecodeRequestOpenAIResponses(body)
	default:
		return Request{}, fmt.Errorf("unsupported ingress style %q", ingress)
	}
}

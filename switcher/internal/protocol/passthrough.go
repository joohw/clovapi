package protocol

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// ShouldPassthroughOpenAIResponsesWire reports identity relay without IR transcoding
// for OpenAI Responses-shaped ingress/egress pairs (Codex CLI ↔ Codex subscription).
func ShouldPassthroughOpenAIResponsesWire(ingress, egress apistyle.Style) bool {
	if ingress != egress {
		return false
	}
	return ingressStyleForResponse(ingress) == apistyle.OpenAIResponses
}

func preparePassthroughOpenAIResponsesRequest(body []byte, hints UpstreamHints) ([]byte, Request, string, error) {
	raw, err := jsonDecodeMap(body)
	if err != nil {
		return nil, Request{}, "", fmt.Errorf("decode openai-responses passthrough request: %w", err)
	}

	model := jsonStringField(raw, "model")
	if m := strings.TrimSpace(hints.Model); m != "" {
		model = m
		raw["model"] = model
	}
	if model == "" {
		return nil, Request{}, "", fmt.Errorf("missing model (set in body or upstream config)")
	}

	if strings.TrimSpace(hints.Source) == "subscription:codex" {
		delete(raw, "temperature")
		delete(raw, "max_output_tokens")
		delete(raw, "max_tokens")
	}

	upstreamJSON, err := json.Marshal(raw)
	if err != nil {
		return nil, Request{}, "", err
	}

	var streamPtr *bool
	if v, ok := raw["stream"]; ok {
		b := coerceBoolPreferTrueDefault(v)
		streamPtr = &b
	}
	meta := &Metadata{}
	if strings.TrimSpace(hints.Source) == "subscription:codex" {
		meta.CodexSubscription = true
	}
	ir := Request{
		Model:  model,
		Stream: streamDefault(streamPtr),
		Meta:   meta,
	}
	pathSuffix := ResolveUpstreamPath(apistyle.OpenAIResponses, ir, hints.Source)
	return upstreamJSON, ir, pathSuffix, nil
}

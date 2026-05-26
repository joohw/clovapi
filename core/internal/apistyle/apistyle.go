package apistyle

import (
	"fmt"
	"strings"
)

// Style is how the upstream HTTP API is spoken when probing or applying config.
type Style string

const (
	Claude          Style = "claude"
	OpenAIChat      Style = "openai-chat"      // POST …/v1/chat/completions
	OpenAIResponses Style = "openai-responses" // POST …/v1/responses (Codex wire_api)
	Gemini          Style = "gemini"
)

// Parse accepts claude, openai-chat, openai-responses, gemini, and legacy alias openai → openai-responses.
func Parse(s string) (Style, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case string(Claude):
		return Claude, nil
	case string(OpenAIChat):
		return OpenAIChat, nil
	case string(OpenAIResponses):
		return OpenAIResponses, nil
	case "openai":
		return OpenAIResponses, nil
	case string(Gemini):
		return Gemini, nil
	default:
		return "", fmt.Errorf("unknown api style %q (want claude|openai-chat|openai-responses|gemini; alias openai→openai-responses)", s)
	}
}

func (s Style) String() string { return string(s) }

// All lists styles shown in help / matrices (stable order).
func All() []Style {
	return []Style{Claude, OpenAIChat, OpenAIResponses, Gemini}
}

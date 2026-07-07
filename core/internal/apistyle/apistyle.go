package apistyle

import (
	"fmt"
	"strings"
)

// Style is how the upstream HTTP API is spoken when probing or applying config.
type Style string

const (
	Claude          Style = "message"   // POST .../v1/messages (Anthropic Messages)
	OpenAIChat      Style = "chat"      // POST .../v1/chat/completions
	OpenAIResponses Style = "responses" // POST .../v1/responses (Codex wire_api)
	Gemini          Style = "gemini"
)

// Parse accepts canonical styles (message, chat, responses, gemini) plus legacy aliases.
func Parse(s string) (Style, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case string(Claude):
		return Claude, nil
	case "claude", "anthropic", "messages":
		return Claude, nil
	case string(OpenAIChat):
		return OpenAIChat, nil
	case "openai-chat":
		return OpenAIChat, nil
	case string(OpenAIResponses):
		return OpenAIResponses, nil
	case "openai", "openai-responses":
		return OpenAIResponses, nil
	case string(Gemini):
		return Gemini, nil
	default:
		return "", fmt.Errorf("unknown api style %q (want chat|responses|message|gemini; legacy aliases: openai-chat|openai-responses|claude|openai)", s)
	}
}

func (s Style) String() string { return string(s) }

// All lists styles shown in help / matrices (stable order).
func All() []Style {
	return []Style{OpenAIChat, OpenAIResponses, Claude, Gemini}
}

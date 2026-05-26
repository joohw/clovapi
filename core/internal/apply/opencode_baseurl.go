package apply

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// ensureWireV1BaseURL appends /v1 when missing so wire clients that suffix paths
// (e.g. Codex POST …/responses, OpenCode …/chat/completions) hit clovapi ingress at …/v1/….
func ensureWireV1BaseURL(baseURL string) string {
	b := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if b == "" {
		return b
	}
	if strings.HasSuffix(strings.ToLower(b), "/v1") {
		return b
	}
	return b + "/v1"
}

// ensureAnthropicWireBaseURL strips a trailing /v1 because Anthropic SDKs append /v1/messages
// (clovapi proxy ingress is …/{provider}/{model}/claude/v1/messages).
func ensureAnthropicWireBaseURL(baseURL string) string {
	b := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if b == "" {
		return b
	}
	low := strings.ToLower(b)
	if strings.HasSuffix(low, "/v1") {
		return strings.TrimRight(b[:len(b)-3], "/")
	}
	return b
}

// ensureOpenCodeSDKBaseURL is an alias kept for OpenCode call sites.
func ensureOpenCodeSDKBaseURL(baseURL string) string {
	return ensureWireV1BaseURL(baseURL)
}

func kimiWireBaseURL(baseURL string, st apistyle.Style) string {
	if st == apistyle.Claude {
		return ensureAnthropicWireBaseURL(baseURL)
	}
	return strings.TrimRight(strings.TrimSpace(baseURL), "/")
}

func openclawWireBaseURL(baseURL string, st apistyle.Style) string {
	if st == apistyle.Claude {
		return ensureAnthropicWireBaseURL(baseURL)
	}
	return strings.TrimRight(strings.TrimSpace(baseURL), "/")
}

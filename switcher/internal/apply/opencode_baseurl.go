package apply

import "strings"

// ensureOpenCodeSDKBaseURL appends /v1 when missing so OpenCode @ai-sdk/* providers
// (which use paths like /chat/completions, not /v1/chat/completions) hit clovapi ingress.
func ensureOpenCodeSDKBaseURL(baseURL string) string {
	b := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if b == "" {
		return b
	}
	if strings.HasSuffix(strings.ToLower(b), "/v1") {
		return b
	}
	return b + "/v1"
}

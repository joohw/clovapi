package apply

import "strings"

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

// ensureOpenCodeSDKBaseURL is an alias kept for OpenCode call sites.
func ensureOpenCodeSDKBaseURL(baseURL string) string {
	return ensureWireV1BaseURL(baseURL)
}

package apply

import "testing"

func TestEnsureOpenCodeSDKBaseURL(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"https://gw", "https://gw/v1"},
		{"https://gw/", "https://gw/v1"},
		{"https://gw/v1", "https://gw/v1"},
		{"https://gw/v1/", "https://gw/v1"},
		{"http://127.0.0.1:27483/codex/gpt-5.4/openai-chat", "http://127.0.0.1:27483/codex/gpt-5.4/openai-chat/v1"},
		{"", ""},
	}
	for _, tc := range tests {
		if got := ensureOpenCodeSDKBaseURL(tc.in); got != tc.want {
			t.Fatalf("ensureOpenCodeSDKBaseURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

package protocol

import (
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestPrepareResponsesInputArrayWithoutTypeForClaudeEgress(t *testing.T) {
	body := []byte(`{
		"model":"claude-sonnet-4-6",
		"stream":true,
		"input":[{"role":"user","content":"Reply exactly: ok"}]
	}`)

	upstream, _, err := PrepareUpstreamRequest(apistyle.OpenAIResponses, apistyle.Claude, body, PrepareOptions{
		Model:       "claude-sonnet-4-6",
		ForceStream: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(upstream), "Reply exactly: ok") {
		t.Fatalf("encoded upstream missing user text: %s", upstream)
	}
}

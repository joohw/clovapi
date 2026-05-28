package protocol

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestPartitionSystemMessagesDeveloperRole(t *testing.T) {
	msgs := []any{
		map[string]any{"role": "developer", "content": "dev rules"},
		map[string]any{"role": "system", "content": "sys rules"},
		map[string]any{"role": "user", "content": "hello"},
	}
	apiMsgs, system := PartitionSystemMessages(msgs, nil)
	if len(apiMsgs) != 1 || apiMsgs[0].Role != RoleUser || apiMsgs[0].Content != "hello" {
		t.Fatalf("apiMsgs = %#v", apiMsgs)
	}
	if system != "dev rules\n\nsys rules" {
		t.Fatalf("system = %q", system)
	}
}

func TestCollectSystemPromptDeveloperFromInputSlots(t *testing.T) {
	dev := Message{Role: "developer", Content: "be helpful"}
	req := Request{
		Meta: &Metadata{System: "base"},
		InputSlots: []InputSlot{
			{Message: &dev},
		},
	}
	if got := CollectSystemPrompt(req); got != "base\n\nbe helpful" {
		t.Fatalf("CollectSystemPrompt = %q", got)
	}
}

func TestDeveloperRoleResponsesToClaudeUpstream(t *testing.T) {
	body := []byte(`{
		"model":"claude-opus-4-7",
		"stream":true,
		"input":[
			{"type":"message","role":"developer","content":[{"type":"input_text","text":"You are Codex."}]},
			{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}
		]
	}`)
	up, _, err := PrepareUpstreamRequest(apistyle.OpenAIResponses, apistyle.Claude, body, PrepareOptions{ForceStream: true})
	if err != nil {
		t.Fatal(err)
	}
	text := string(up)
	if strings.Contains(text, `"developer"`) {
		t.Fatalf("upstream must not contain developer role: %s", up)
	}
	var got map[string]any
	if err := json.Unmarshal(up, &got); err != nil {
		t.Fatal(err)
	}
	system, _ := got["system"].(string)
	if system != "You are Codex." {
		t.Fatalf("system = %q", system)
	}
	msgs, _ := got["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("messages = %#v", got["messages"])
	}
	msg, _ := msgs[0].(map[string]any)
	if msg["role"] != "user" {
		t.Fatalf("message role = %#v", msg["role"])
	}
}

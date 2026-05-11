package apistyle

import "testing"

func TestParse(t *testing.T) {
	if _, err := Parse(""); err == nil {
		t.Fatal("empty")
	}
	s, err := Parse("OPENAI-CHAT")
	if err != nil || s != OpenAIChat {
		t.Fatalf("%v %v", s, err)
	}
	r, err := Parse("openai-responses")
	if err != nil || r != OpenAIResponses {
		t.Fatalf("%v %v", r, err)
	}
	legacy, err := Parse("openai")
	if err != nil || legacy != OpenAIResponses {
		t.Fatalf("alias openai: %v %v", legacy, err)
	}
}

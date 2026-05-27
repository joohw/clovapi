package protocol

import (
	"strings"
	"testing"

	"github.com/clovapi/switcher/internal/apistyle"
)

func TestMaterializePlainUpstreamEventsHTTPErrorPreservesPlaintextBody(t *testing.T) {
	body := []byte("upstream connect error or disconnect/reset before headers")
	ev := MaterializePlainUpstreamEvents(apistyle.OpenAIResponses, 503, body)
	if len(ev) != 1 || ev[0].Type != RespError {
		t.Fatalf("events = %#v", ev)
	}
	if ev[0].Code != UpstreamErrorCode {
		t.Fatalf("code = %q want %q", ev[0].Code, UpstreamErrorCode)
	}
	if ev[0].Message != string(body) {
		t.Fatalf("message = %q", ev[0].Message)
	}
}

func TestMaterializePlainUpstreamEventsSuccessBodyStillDecodeFailed(t *testing.T) {
	ev := MaterializePlainUpstreamEvents(apistyle.OpenAIResponses, 200, []byte("undefined"))
	if len(ev) != 1 || ev[0].Type != RespError {
		t.Fatalf("events = %#v", ev)
	}
	if ev[0].Code != DecodeFailCode {
		t.Fatalf("code = %q want %q", ev[0].Code, DecodeFailCode)
	}
	if !strings.Contains(ev[0].Message, "invalid character") {
		t.Fatalf("message = %q", ev[0].Message)
	}
}

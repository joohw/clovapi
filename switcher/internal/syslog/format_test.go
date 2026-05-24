package syslog

import (
	"strings"
	"testing"
)

func TestFormatListLine(t *testing.T) {
	line := FormatListLine(Entry{
		ID:      "42",
		At:      "2026-05-24T12:34:56.789Z",
		Stream:  "system",
		Message: "apply codex model=gpt-5.5 style=openai-responses",
	})
	if !strings.Contains(line, "42") || !strings.Contains(line, "SYS") || !strings.Contains(line, "apply codex") {
		t.Fatalf("unexpected line: %q", line)
	}
}

func TestOneLineMessage(t *testing.T) {
	got := oneLineMessage("apply  codex\nmodel=gpt-5.5")
	want := "apply codex model=gpt-5.5"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

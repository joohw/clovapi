package agentkind

import (
	"fmt"
	"strings"
)

// Kind identifies a local CLI / agent whose config we rewrite.
type Kind string

const (
	ClaudeCode Kind = "claude-code"
	Codex      Kind = "codex"
	OpenCode   Kind = "opencode"
	OpenClaw   Kind = "openclaw"
	Hermes     Kind = "hermes"
	KimiCode   Kind = "kimi-code"
)

func Parse(s string) (Kind, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case string(ClaudeCode):
		return ClaudeCode, nil
	case string(Codex):
		return Codex, nil
	case string(OpenCode):
		return OpenCode, nil
	case string(OpenClaw):
		return OpenClaw, nil
	case string(Hermes):
		return Hermes, nil
	case string(KimiCode), "kimi":
		return KimiCode, nil
	default:
		return "", fmt.Errorf("unknown cli %q (want claude-code|codex|opencode|openclaw|hermes|kimi-code)", s)
	}
}

func (k Kind) String() string { return string(k) }

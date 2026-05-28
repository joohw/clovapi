package protocolcompat

import (
	"regexp"
	"strings"
)

var standaloneHermesRE = regexp.MustCompile(`(?i)\bhermes\b`)

// ScrubHermesIdentitySystemText removes Hermes-specific identity markers before
// forwarding requests to upstreams that reject nested agent identities.
func ScrubHermesIdentitySystemText(system string) string {
	system = strings.ReplaceAll(system, "\r\n", "\n")
	lines := strings.Split(system, "\n")
	out := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "hermes agent") ||
			strings.Contains(lower, "hermes-agent") ||
			strings.Contains(lower, "hermes_home") {
			continue
		}
		line = standaloneHermesRE.ReplaceAllString(line, "the agent")
		isBlank := strings.TrimSpace(line) == ""
		if isBlank && blank {
			continue
		}
		out = append(out, line)
		blank = isBlank
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

//go:build darwin

package profile

import (
	"encoding/json"
	"os/exec"
	"strings"
)

func loadClaudeCredentialsFromKeychain() (claudeCredentialsFile, bool) {
	if claudeKeychainLookupDisabled {
		return claudeCredentialsFile{}, false
	}
	out, err := exec.Command("security", "find-generic-password", "-s", "Claude Code-credentials", "-w").Output()
	if err != nil {
		return claudeCredentialsFile{}, false
	}
	var raw claudeCredentialsFile
	if json.Unmarshal([]byte(strings.TrimSpace(string(out))), &raw) != nil {
		return claudeCredentialsFile{}, false
	}
	if !claudeSubscriptionCredentialsValid(raw.ClaudeAiOauth) {
		return claudeCredentialsFile{}, false
	}
	return raw, true
}

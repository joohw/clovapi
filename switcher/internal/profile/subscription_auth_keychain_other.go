//go:build !darwin

package profile

func loadClaudeCredentialsFromKeychain() (claudeCredentialsFile, bool) {
	return claudeCredentialsFile{}, false
}

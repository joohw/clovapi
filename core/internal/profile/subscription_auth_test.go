package profile

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeClaudeStore(t *testing.T, dir, body string) string {
	t.Helper()
	path := filepath.Join(dir, "claude.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadClaudeSubscriptionCredentialsValid(t *testing.T) {
	path := writeClaudeStore(t, t.TempDir(), `{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat-valid",
    "refreshToken": "rt",
    "expiresAt": 9999999999999
  }
}`)
	SetClaudeCredentialsPathOverride(path)
	t.Cleanup(func() { SetClaudeCredentialsPathOverride("") })

	creds, ok := loadClaudeSubscriptionCredentials()
	if !ok {
		t.Fatal("expected valid subscription credentials")
	}
	if creds.APIKey != "sk-ant-oat-valid" {
		t.Fatalf("unexpected api key: %q", creds.APIKey)
	}
	if creds.BaseURL != anthropicOAuthBaseURL {
		t.Fatalf("unexpected base url: %q", creds.BaseURL)
	}
}

func TestLoadClaudeSubscriptionCredentialsExpiredWithoutRefreshTokenFails(t *testing.T) {
	expired := time.Now().Add(-time.Hour).UnixMilli()
	path := writeClaudeStore(t, t.TempDir(), `{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat-expired",
    "expiresAt": `+itoa(expired)+`
  }
}`)
	SetClaudeCredentialsPathOverride(path)
	t.Cleanup(func() { SetClaudeCredentialsPathOverride("") })

	if _, ok := loadClaudeSubscriptionCredentials(); ok {
		t.Fatal("expired token without refresh token must not resolve")
	}
}

func TestLoadClaudeSubscriptionCredentialsMissingStoreFails(t *testing.T) {
	SetClaudeCredentialsPathOverride(filepath.Join(t.TempDir(), "does-not-exist.json"))
	t.Cleanup(func() { SetClaudeCredentialsPathOverride("") })

	if _, ok := loadClaudeSubscriptionCredentials(); ok {
		t.Fatal("missing clovapi store must not resolve")
	}
}

func itoa(v int64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

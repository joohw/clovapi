package subscriptionauth

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGeneratePKCEChallenge(t *testing.T) {
	pair, err := generatePKCE()
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(pair.Verifier))
	want := base64.RawURLEncoding.EncodeToString(sum[:])
	if pair.Challenge != want {
		t.Fatalf("challenge mismatch")
	}
	if strings.ContainsAny(pair.Verifier, "+/=") || strings.ContainsAny(pair.Challenge, "+/=") {
		t.Fatalf("pkce values must be base64url without padding")
	}
}

func TestBuildClaudeAuthorizeURLUsesClaudeCodeClientID(t *testing.T) {
	raw := buildClaudeAuthorizeURL(pkcePair{Verifier: "verifier", Challenge: "challenge"}, "http://localhost:53692/callback")
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := parsed.Query().Get("client_id"), "9d1c250a-e61b-44d9-88ed-5944d1962f5e"; got != want {
		t.Fatalf("client_id = %q, want %q", got, want)
	}
}

func TestCodexAccountIDFromAccessToken(t *testing.T) {
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"https://api.openai.com/auth":{"chatgpt_account_id":"acct_123"}}`))
	token := "header." + payload + ".sig"
	if got := codexAccountIDFromAccessToken(token); got != "acct_123" {
		t.Fatalf("account id = %q", got)
	}
}

func TestWriteCodexOAuthCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.json")
	err := writeCodexOAuthCredentials(path, tokenCredentials{
		Access:    "access-token",
		Refresh:   "refresh-token",
		AccountID: "acct_123",
	})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatal(err)
	}
	tokens, _ := payload["tokens"].(map[string]any)
	if payload["auth_mode"] != "chatgpt" || tokens["access_token"] != "access-token" || tokens["account_id"] != "acct_123" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestWriteClaudeOAuthCredentialsPreservesMetadata(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".credentials.json")
	if err := writeJSON0600(path, map[string]any{"claudeAiOauth": map[string]any{"subscriptionType": "Max"}}); err != nil {
		t.Fatal(err)
	}
	err := writeClaudeOAuthCredentials(path, tokenCredentials{
		Access:  "access-token",
		Refresh: "refresh-token",
		Expires: 123,
	})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		ClaudeAiOauth map[string]any `json:"claudeAiOauth"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.ClaudeAiOauth["accessToken"] != "access-token" || payload.ClaudeAiOauth["subscriptionType"] != "Max" {
		t.Fatalf("unexpected payload: %#v", payload.ClaudeAiOauth)
	}
}

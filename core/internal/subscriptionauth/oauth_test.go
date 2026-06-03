package subscriptionauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOAuthHTTPClientBypassesEnvironmentProxy(t *testing.T) {
	transport, ok := oauthHTTPClient.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("oauth transport = %T, want *http.Transport", oauthHTTPClient.Transport)
	}
	if transport.Proxy != nil {
		t.Fatal("oauth HTTP client must bypass environment proxy settings")
	}
}

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

func TestRefreshClaudeTokenPersistsToOwnStore(t *testing.T) {
	var gotGrant, gotRefresh string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotGrant = body["grant_type"]
		gotRefresh = body["refresh_token"]
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":     "sk-ant-oat-new",
			"refresh_token":    "rt-new",
			"expires_in":       3600,
			"subscriptionType": "Max",
		})
	}))
	defer srv.Close()

	prevURL := claudeTokenURL
	claudeTokenURL = srv.URL
	defer func() { claudeTokenURL = prevURL }()

	path := filepath.Join(t.TempDir(), "claude.json")
	access, expiresAt, ok := RefreshClaudeToken(context.Background(), "rt-old", path)
	if !ok {
		t.Fatal("refresh should succeed")
	}
	if gotGrant != "refresh_token" || gotRefresh != "rt-old" {
		t.Fatalf("unexpected request grant=%q refresh=%q", gotGrant, gotRefresh)
	}
	if access != "sk-ant-oat-new" || expiresAt == 0 {
		t.Fatalf("unexpected creds access=%q expiresAt=%d", access, expiresAt)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		ClaudeAiOauth map[string]any `json:"claudeAiOauth"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.ClaudeAiOauth["accessToken"] != "sk-ant-oat-new" ||
		doc.ClaudeAiOauth["refreshToken"] != "rt-new" ||
		doc.ClaudeAiOauth["subscriptionType"] != "Max" {
		t.Fatalf("unexpected stored doc: %#v", doc.ClaudeAiOauth)
	}
}

func TestRefreshClaudeTokenKeepsRefreshWhenServerOmits(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "sk-ant-oat-new",
			"expires_in":   3600,
		})
	}))
	defer srv.Close()

	prevURL := claudeTokenURL
	claudeTokenURL = srv.URL
	defer func() { claudeTokenURL = prevURL }()

	path := filepath.Join(t.TempDir(), "claude.json")
	if _, _, ok := RefreshClaudeToken(context.Background(), "rt-old", path); !ok {
		t.Fatal("refresh should succeed")
	}
	data, _ := os.ReadFile(path)
	var doc struct {
		ClaudeAiOauth map[string]any `json:"claudeAiOauth"`
	}
	_ = json.Unmarshal(data, &doc)
	if doc.ClaudeAiOauth["refreshToken"] != "rt-old" {
		t.Fatalf("expected refresh token carried forward, got %#v", doc.ClaudeAiOauth["refreshToken"])
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

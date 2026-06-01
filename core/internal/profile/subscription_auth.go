package profile

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/subscriptionauth"
)

const (
	anthropicOAuthBaseURL = "https://api.anthropic.com"
	codexBackendBaseURL   = "https://chatgpt.com/backend-api"
)

var (
	claudeCredentialsPathOverride string
	codexCredentialsPathOverride  string
	claudeRefreshMu               sync.Mutex
)

// SetClaudeCredentialsPathOverride pins Claude OAuth file path (tests only).
func SetClaudeCredentialsPathOverride(path string) {
	claudeCredentialsPathOverride = strings.TrimSpace(path)
}

// SetCodexCredentialsPathOverride pins Codex OAuth file path (tests only).
func SetCodexCredentialsPathOverride(path string) {
	codexCredentialsPathOverride = strings.TrimSpace(path)
}

type subscriptionCredentials struct {
	BaseURL   string
	APIKey    string
	AccountID string
}

type claudeOAuthBlob struct {
	AccessToken  string  `json:"accessToken"`
	RefreshToken string  `json:"refreshToken"`
	ExpiresAt    float64 `json:"expiresAt"`
}

type claudeCredentialsFile struct {
	ClaudeAiOauth *claudeOAuthBlob `json:"claudeAiOauth"`
}

type codexAuthFile struct {
	Tokens *struct {
		AccessToken string `json:"access_token"`
		AccessAlt   string `json:"accessToken"`
		AccountID   string `json:"account_id"`
	} `json:"tokens"`
}

// claudeCredentialsPath returns clovapi's own Claude OAuth store. It is independent
// from Claude Code's ~/.claude/.credentials.json; clovapi never reads that file.
func claudeCredentialsPath() (string, error) {
	if claudeCredentialsPathOverride != "" {
		return claudeCredentialsPathOverride, nil
	}
	return config.ClaudeSubscriptionAuthPath()
}

func codexAuthPath() (string, error) {
	if codexCredentialsPathOverride != "" {
		return codexCredentialsPathOverride, nil
	}
	return config.CodexSubscriptionAuthPath()
}

func readJSONFile(path string, dest any) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return json.Unmarshal(data, dest) == nil
}

func claudeSubscriptionCredentialsValid(oauth *claudeOAuthBlob) bool {
	if oauth == nil {
		return false
	}
	token := strings.TrimSpace(oauth.AccessToken)
	if token == "" {
		return false
	}
	expiresAt := oauth.ExpiresAt
	if expiresAt > 0 && float64(time.Now().UnixMilli()) > expiresAt {
		return false
	}
	return true
}

func loadClaudeSubscriptionCredentials() (subscriptionCredentials, bool) {
	raw, ok := loadClaudeCredentialsDocument()
	if !ok {
		return subscriptionCredentials{}, false
	}
	return subscriptionCredentials{
		BaseURL: anthropicOAuthBaseURL,
		APIKey:  strings.TrimSpace(raw.ClaudeAiOauth.AccessToken),
	}, true
}

func loadClaudeCredentialsDocument() (claudeCredentialsFile, bool) {
	path, err := claudeCredentialsPath()
	if err != nil {
		return claudeCredentialsFile{}, false
	}
	var raw claudeCredentialsFile
	if !readJSONFile(path, &raw) || raw.ClaudeAiOauth == nil {
		return claudeCredentialsFile{}, false
	}
	if claudeSubscriptionCredentialsValid(raw.ClaudeAiOauth) {
		return raw, true
	}
	// Access token expired: refresh using clovapi's own refresh token and persist
	// back to clovapi's own store. Claude Code's credentials are never touched.
	return refreshClaudeCredentials(path, raw.ClaudeAiOauth.RefreshToken)
}

// refreshClaudeCredentials mints a fresh access token from the stored refresh token.
// It serializes concurrent refreshes and re-checks the store after acquiring the lock
// so a burst of expired-token reads only triggers a single network refresh.
func refreshClaudeCredentials(path, refreshToken string) (claudeCredentialsFile, bool) {
	if strings.TrimSpace(refreshToken) == "" {
		return claudeCredentialsFile{}, false
	}
	claudeRefreshMu.Lock()
	defer claudeRefreshMu.Unlock()

	var current claudeCredentialsFile
	if readJSONFile(path, &current) && claudeSubscriptionCredentialsValid(current.ClaudeAiOauth) {
		return current, true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, _, ok := subscriptionauth.RefreshClaudeToken(ctx, refreshToken, path); !ok {
		return claudeCredentialsFile{}, false
	}

	var fresh claudeCredentialsFile
	if readJSONFile(path, &fresh) && claudeSubscriptionCredentialsValid(fresh.ClaudeAiOauth) {
		return fresh, true
	}
	return claudeCredentialsFile{}, false
}

// ClaudeAuthRoot returns the Claude OAuth document for desktop auth status.
func ClaudeAuthRoot() (map[string]any, bool) {
	raw, ok := loadClaudeCredentialsDocument()
	if !ok || raw.ClaudeAiOauth == nil {
		return nil, false
	}
	o := raw.ClaudeAiOauth
	out := map[string]any{
		"accessToken": strings.TrimSpace(o.AccessToken),
		"expiresAt":   o.ExpiresAt,
	}
	return map[string]any{"claudeAiOauth": out}, true
}

func codexSubscriptionCredentialsValid(tokens *struct {
	AccessToken string `json:"access_token"`
	AccessAlt   string `json:"accessToken"`
	AccountID   string `json:"account_id"`
}) bool {
	if tokens == nil {
		return false
	}
	access := strings.TrimSpace(tokens.AccessToken)
	if access == "" {
		access = strings.TrimSpace(tokens.AccessAlt)
	}
	if access == "" {
		return false
	}
	return strings.TrimSpace(tokens.AccountID) != "" || codexAccountIDFromAccessToken(access) != ""
}

func loadCodexSubscriptionCredentials() (subscriptionCredentials, bool) {
	path, err := codexAuthPath()
	if err != nil {
		return subscriptionCredentials{}, false
	}
	var raw codexAuthFile
	if !readJSONFile(path, &raw) || !codexSubscriptionCredentialsValid(raw.Tokens) {
		return subscriptionCredentials{}, false
	}
	access := strings.TrimSpace(raw.Tokens.AccessToken)
	if access == "" {
		access = strings.TrimSpace(raw.Tokens.AccessAlt)
	}
	accountID := strings.TrimSpace(raw.Tokens.AccountID)
	if accountID == "" {
		accountID = codexAccountIDFromAccessToken(access)
	}
	return subscriptionCredentials{
		BaseURL:   codexBackendBaseURL,
		APIKey:    access,
		AccountID: accountID,
	}, true
}

func HydrateSubscriptionCredentials(p *Profile) {
	if p == nil || strings.ToLower(strings.TrimSpace(p.Kind)) != "subscription" {
		return
	}
	var creds subscriptionCredentials
	var ok bool
	switch strings.TrimSpace(p.SubscriptionProviderID) {
	case "claude-code":
		creds, ok = loadClaudeSubscriptionCredentials()
	case "codex":
		creds, ok = loadCodexSubscriptionCredentials()
	default:
		return
	}
	if !ok {
		return
	}
	if strings.TrimSpace(p.BaseURL) == "" {
		p.BaseURL = creds.BaseURL
	}
	if strings.TrimSpace(p.APIKey) == "" {
		p.APIKey = creds.APIKey
	}
	if strings.TrimSpace(p.AccountID) == "" && strings.TrimSpace(creds.AccountID) != "" {
		p.AccountID = creds.AccountID
	}
}

const codexJWTAuthClaim = "https://api.openai.com/auth"

func codexAccountIDFromAccessToken(accessToken string) string {
	token := strings.TrimSpace(accessToken)
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims map[string]any
	if json.Unmarshal(payload, &claims) != nil {
		return ""
	}
	auth, _ := claims[codexJWTAuthClaim].(map[string]any)
	if auth == nil {
		return ""
	}
	id, _ := auth["chatgpt_account_id"].(string)
	return strings.TrimSpace(id)
}

package profile

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	anthropicOAuthBaseURL = "https://api.anthropic.com"
	codexBackendBaseURL   = "https://chatgpt.com/backend-api"
)

var (
	claudeCredentialsPathOverride string
	codexHomeOverride             string
)

// SetClaudeCredentialsPathOverride pins Claude OAuth file path (tests only).
func SetClaudeCredentialsPathOverride(path string) {
	claudeCredentialsPathOverride = strings.TrimSpace(path)
}

// SetCodexHomeOverride pins Codex home directory (tests only).
func SetCodexHomeOverride(dir string) {
	codexHomeOverride = strings.TrimSpace(dir)
}

type subscriptionCredentials struct {
	BaseURL   string
	APIKey    string
	AccountID string
}

type claudeCredentialsFile struct {
	ClaudeAiOauth *struct {
		AccessToken string  `json:"accessToken"`
		ExpiresAt   float64 `json:"expiresAt"`
	} `json:"claudeAiOauth"`
}

type codexAuthFile struct {
	Tokens *struct {
		AccessToken string `json:"access_token"`
		AccessAlt   string `json:"accessToken"`
		AccountID   string `json:"account_id"`
	} `json:"tokens"`
}

func claudeCredentialsPath() (string, error) {
	if claudeCredentialsPathOverride != "" {
		return claudeCredentialsPathOverride, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude", ".credentials.json"), nil
}

func codexAuthPath() (string, error) {
	codexHome := codexHomeOverride
	if codexHome == "" {
		codexHome = strings.TrimSpace(os.Getenv("CODEX_HOME"))
	}
	if codexHome == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		codexHome = filepath.Join(home, ".codex")
	}
	return filepath.Join(codexHome, "auth.json"), nil
}

func readJSONFile(path string, dest any) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return json.Unmarshal(data, dest) == nil
}

func claudeSubscriptionCredentialsValid(oauth *struct {
	AccessToken string  `json:"accessToken"`
	ExpiresAt   float64 `json:"expiresAt"`
}) bool {
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
	path, err := claudeCredentialsPath()
	if err != nil {
		return subscriptionCredentials{}, false
	}
	var raw claudeCredentialsFile
	if !readJSONFile(path, &raw) || !claudeSubscriptionCredentialsValid(raw.ClaudeAiOauth) {
		return subscriptionCredentials{}, false
	}
	return subscriptionCredentials{
		BaseURL: anthropicOAuthBaseURL,
		APIKey:  strings.TrimSpace(raw.ClaudeAiOauth.AccessToken),
	}, true
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

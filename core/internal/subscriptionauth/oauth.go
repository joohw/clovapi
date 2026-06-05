package subscriptionauth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/config"
)

const (
	ProviderClaudeCode = "claude-code"
	ProviderCodex      = "codex"

	claudeClientID     = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	claudeAuthorizeURL = "https://claude.ai/oauth/authorize"
	claudeProfileURL   = "https://api.anthropic.com/api/oauth/profile"
	claudeCallbackPort = 53692
	claudeCallbackPath = "/callback"
	claudeScopes       = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"

	codexClientID     = "app_EMoamEEZ73f0CkXaXp7hrann"
	codexAuthorizeURL = "https://auth.openai.com/oauth/authorize"
	codexTokenURL     = "https://auth.openai.com/oauth/token"
	codexCallbackPort = 1455
	codexCallbackPath = "/auth/callback"
	codexScope        = "openid profile email offline_access"
	codexAuthClaim    = "https://api.openai.com/auth"

	loginTimeout         = 10 * time.Minute
	tokenExchangeTimeout = 45 * time.Second
)

// claudeTokenURL is a var (not const) so tests can point it at a local server.
var claudeTokenURL = "https://platform.claude.com/v1/oauth/token"

type LoginResult struct {
	OK           bool   `json:"ok"`
	LoggedIn     bool   `json:"loggedIn,omitempty"`
	Refreshed    bool   `json:"refreshed,omitempty"`
	AuthorizeURL string `json:"authorizeUrl,omitempty"`
	Error        string `json:"error,omitempty"`
}

type tokenCredentials struct {
	Access           string
	Refresh          string
	Expires          int64
	AccountID        string
	SubscriptionType string
	RateLimitTier    string
	Scopes           []string
	OrganizationType string
	Email            string
	DisplayName      string
}

func Login(ctx context.Context, providerID string, openBrowser bool) LoginResult {
	ctx, cancel := context.WithTimeout(ctx, loginTimeout)
	defer cancel()

	providerID = strings.TrimSpace(providerID)
	logAuthEvent(providerID, "login started (openBrowser=%t)", openBrowser)

	var (
		authorizeURL string
		err          error
	)
	switch providerID {
	case ProviderClaudeCode:
		authorizeURL, err = loginClaude(ctx, openBrowser)
	case ProviderCodex:
		authorizeURL, err = loginCodex(ctx, openBrowser)
	default:
		err = fmt.Errorf("unknown provider: %s", providerID)
	}
	if err != nil {
		logAuthFailure(providerID, "login", err)
		return LoginResult{OK: false, AuthorizeURL: authorizeURL, Error: err.Error()}
	}
	logAuthSuccess(providerID, "login", "credentials saved")
	return LoginResult{OK: true, LoggedIn: true, Refreshed: true, AuthorizeURL: authorizeURL}
}

func loginClaude(ctx context.Context, openBrowser bool) (string, error) {
	pkce, err := generatePKCE()
	if err != nil {
		return "", err
	}
	redirectURI := fmt.Sprintf("http://localhost:%d%s", claudeCallbackPort, claudeCallbackPath)
	logAuthEvent(ProviderClaudeCode, "listening on %s", callbackListenAddr(ProviderClaudeCode, claudeCallbackPort, claudeCallbackPath))
	server, err := startCallbackServer(ctx, callbackOptions{
		Provider: ProviderClaudeCode,
		Port:     claudeCallbackPort,
		Path:     claudeCallbackPath,
		Validate: func(values url.Values) (callbackData, callbackError) {
			if msg := values.Get("error"); msg != "" {
				return callbackData{}, callbackError{Status: http.StatusBadRequest, Message: "Claude authorization was not completed.", Details: msg}
			}
			code := strings.TrimSpace(values.Get("code"))
			state := strings.TrimSpace(values.Get("state"))
			if code == "" || state == "" {
				return callbackData{}, callbackError{Status: http.StatusBadRequest, Message: "Missing code or state parameter."}
			}
			if state != pkce.Verifier {
				return callbackData{}, callbackError{Status: http.StatusBadRequest, Message: "OAuth state does not match."}
			}
			return callbackData{Code: code, State: state}, callbackError{}
		},
	})
	if err != nil {
		return "", err
	}
	defer server.Close()

	authURL := buildClaudeAuthorizeURL(pkce, redirectURI)
	if openBrowser {
		_ = openBrowserURL(authURL)
	}
	cb, err := server.Wait(ctx)
	if err != nil {
		return authURL, err
	}
	logAuthSuccess(ProviderClaudeCode, "callback", "code received")
	exchangeCtx, exchangeCancel := context.WithTimeout(ctx, tokenExchangeTimeout)
	defer exchangeCancel()
	creds, err := exchangeClaudeCode(exchangeCtx, cb.Code, cb.State, pkce.Verifier, redirectURI)
	if err != nil {
		return authURL, err
	}
	_ = enrichClaudeProfile(ctx, &creds)
	if err := writeClaudeOAuthCredentials(claudeAuthPath(), creds); err != nil {
		return authURL, err
	}
	return authURL, nil
}

func loginCodex(ctx context.Context, openBrowser bool) (string, error) {
	pkce, err := generatePKCE()
	if err != nil {
		return "", err
	}
	state, err := randomHex(16)
	if err != nil {
		return "", err
	}
	redirectURI := codexRedirectURI()
	logAuthEvent(ProviderCodex, "listening on %s", callbackListenAddr(ProviderCodex, codexCallbackPort, codexCallbackPath))
	server, err := startCallbackServer(ctx, callbackOptions{
		Provider: ProviderCodex,
		Port:     codexCallbackPort,
		Path:     codexCallbackPath,
		Validate: func(values url.Values) (callbackData, callbackError) {
			if msg := values.Get("error"); msg != "" {
				return callbackData{}, callbackError{Status: http.StatusBadRequest, Message: "OpenAI authorization was not completed.", Details: msg}
			}
			if strings.TrimSpace(values.Get("state")) != state {
				return callbackData{}, callbackError{Status: http.StatusBadRequest, Message: "OAuth state does not match."}
			}
			code := strings.TrimSpace(values.Get("code"))
			if code == "" {
				return callbackData{}, callbackError{Status: http.StatusBadRequest, Message: "Missing authorization code."}
			}
			return callbackData{Code: code}, callbackError{}
		},
	})
	if err != nil {
		return "", err
	}
	defer server.Close()

	authURL := buildCodexAuthorizeURL(pkce, state, redirectURI)
	if openBrowser {
		_ = openBrowserURL(authURL)
	}
	cb, err := server.Wait(ctx)
	if err != nil {
		return authURL, err
	}
	logAuthSuccess(ProviderCodex, "callback", "code received")
	exchangeCtx, exchangeCancel := context.WithTimeout(ctx, tokenExchangeTimeout)
	defer exchangeCancel()
	creds, err := exchangeCodexCode(exchangeCtx, cb.Code, pkce.Verifier, redirectURI)
	if err != nil {
		return authURL, err
	}
	if err := writeCodexOAuthCredentials(codexAuthPath(), creds); err != nil {
		return authURL, err
	}
	return authURL, nil
}

type pkcePair struct {
	Verifier  string
	Challenge string
}

func generatePKCE() (pkcePair, error) {
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return pkcePair{}, err
	}
	verifier := base64.RawURLEncoding.EncodeToString(verifierBytes)
	sum := sha256.Sum256([]byte(verifier))
	return pkcePair{Verifier: verifier, Challenge: base64.RawURLEncoding.EncodeToString(sum[:])}, nil
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", buf), nil
}

func buildClaudeAuthorizeURL(pkce pkcePair, redirectURI string) string {
	q := url.Values{}
	q.Set("code", "true")
	q.Set("client_id", claudeClientID)
	q.Set("response_type", "code")
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", claudeScopes)
	q.Set("code_challenge", pkce.Challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("state", pkce.Verifier)
	return claudeAuthorizeURL + "?" + q.Encode()
}

func codexRedirectURI() string {
	return fmt.Sprintf("http://localhost:%d%s", codexCallbackPort, codexCallbackPath)
}
func buildCodexAuthorizeURL(pkce pkcePair, state, redirectURI string) string {
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", codexClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", codexScope)
	q.Set("code_challenge", pkce.Challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("state", state)
	q.Set("id_token_add_organizations", "true")
	q.Set("codex_cli_simplified_flow", "true")
	q.Set("originator", "clovapi")
	return codexAuthorizeURL + "?" + q.Encode()
}

func exchangeClaudeCode(ctx context.Context, code, state, verifier, redirectURI string) (tokenCredentials, error) {
	payload := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     claudeClientID,
		"code":          code,
		"state":         state,
		"redirect_uri":  redirectURI,
		"code_verifier": verifier,
	}
	var out struct {
		AccessToken      string `json:"access_token"`
		RefreshToken     string `json:"refresh_token"`
		ExpiresIn        int64  `json:"expires_in"`
		SubscriptionType string `json:"subscription_type"`
		SubscriptionAlt  string `json:"subscriptionType"`
		RateLimitTier    string `json:"rate_limit_tier"`
		RateLimitAlt     string `json:"rateLimitTier"`
		Scope            any    `json:"scope"`
		Scopes           any    `json:"scopes"`
		Tier             string `json:"tier"`
		Plan             string `json:"plan"`
	}
	if err := postJSON(ctx, claudeTokenURL, payload, &out); err != nil {
		return tokenCredentials{}, err
	}
	if strings.TrimSpace(out.AccessToken) == "" || strings.TrimSpace(out.RefreshToken) == "" {
		return tokenCredentials{}, fmt.Errorf("token response is missing access_token or refresh_token")
	}
	expires := time.Now().Add(time.Hour).UnixMilli()
	if out.ExpiresIn > 0 {
		expires = time.Now().Add(time.Duration(out.ExpiresIn)*time.Second - 5*time.Minute).UnixMilli()
	}
	return tokenCredentials{
		Access:           strings.TrimSpace(out.AccessToken),
		Refresh:          strings.TrimSpace(out.RefreshToken),
		Expires:          expires,
		SubscriptionType: firstNonEmpty(out.SubscriptionType, out.SubscriptionAlt, out.Tier, out.Plan),
		RateLimitTier:    firstNonEmpty(out.RateLimitTier, out.RateLimitAlt),
		Scopes:           parseScopes(out.Scopes, out.Scope),
	}, nil
}

// RefreshClaudeToken exchanges a refresh token for a fresh access token using the
// OAuth refresh_token grant, then persists the result to writePath (clovapi's own
// store). It never touches Claude Code's ~/.claude/.credentials.json.
//
// writePath is passed in (rather than always using claudeAuthPath) so callers and
// tests can target an explicit store file.
func RefreshClaudeToken(ctx context.Context, refreshToken, writePath string) (access string, expiresAt int64, ok bool) {
	rt := strings.TrimSpace(refreshToken)
	if rt == "" {
		return "", 0, false
	}
	if strings.TrimSpace(writePath) == "" {
		writePath = claudeAuthPath()
	}
	creds, err := exchangeClaudeRefresh(ctx, rt)
	if err != nil {
		return "", 0, false
	}
	// Carry the previous refresh token forward if the server didn't rotate it.
	if strings.TrimSpace(creds.Refresh) == "" {
		creds.Refresh = rt
	}
	if err := writeClaudeOAuthCredentials(writePath, creds); err != nil {
		return "", 0, false
	}
	return creds.Access, creds.Expires, true
}

func exchangeClaudeRefresh(ctx context.Context, refreshToken string) (tokenCredentials, error) {
	payload := map[string]string{
		"grant_type":    "refresh_token",
		"client_id":     claudeClientID,
		"refresh_token": refreshToken,
	}
	var out struct {
		AccessToken      string `json:"access_token"`
		RefreshToken     string `json:"refresh_token"`
		ExpiresIn        int64  `json:"expires_in"`
		SubscriptionType string `json:"subscription_type"`
		SubscriptionAlt  string `json:"subscriptionType"`
		RateLimitTier    string `json:"rate_limit_tier"`
		RateLimitAlt     string `json:"rateLimitTier"`
		Scope            any    `json:"scope"`
		Scopes           any    `json:"scopes"`
	}
	if err := postJSON(ctx, claudeTokenURL, payload, &out); err != nil {
		return tokenCredentials{}, err
	}
	if strings.TrimSpace(out.AccessToken) == "" {
		return tokenCredentials{}, fmt.Errorf("refresh response is missing access_token")
	}
	expires := time.Now().Add(time.Hour).UnixMilli()
	if out.ExpiresIn > 0 {
		expires = time.Now().Add(time.Duration(out.ExpiresIn)*time.Second - 5*time.Minute).UnixMilli()
	}
	return tokenCredentials{
		Access:           strings.TrimSpace(out.AccessToken),
		Refresh:          strings.TrimSpace(out.RefreshToken),
		Expires:          expires,
		SubscriptionType: firstNonEmpty(out.SubscriptionType, out.SubscriptionAlt),
		RateLimitTier:    firstNonEmpty(out.RateLimitTier, out.RateLimitAlt),
		Scopes:           parseScopes(out.Scopes, out.Scope),
	}, nil
}

func exchangeCodexCode(ctx context.Context, code, verifier, redirectURI string) (tokenCredentials, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", codexClientID)
	form.Set("code", code)
	form.Set("code_verifier", verifier)
	form.Set("redirect_uri", redirectURI)
	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int64  `json:"expires_in"`
	}
	if err := postForm(ctx, codexTokenURL, form, &out); err != nil {
		return tokenCredentials{}, err
	}
	logAuthSuccess(ProviderCodex, "token exchange", "tokens received")
	if strings.TrimSpace(out.AccessToken) == "" || strings.TrimSpace(out.RefreshToken) == "" || out.ExpiresIn <= 0 {
		return tokenCredentials{}, fmt.Errorf("Codex token response is missing required fields")
	}
	accountID := codexAccountIDFromAccessToken(out.AccessToken)
	if accountID == "" {
		return tokenCredentials{}, fmt.Errorf("could not parse ChatGPT account_id from access_token")
	}
	return tokenCredentials{
		Access:    strings.TrimSpace(out.AccessToken),
		Refresh:   strings.TrimSpace(out.RefreshToken),
		Expires:   time.Now().Add(time.Duration(out.ExpiresIn) * time.Second).UnixMilli(),
		AccountID: accountID,
	}, nil
}

func enrichClaudeProfile(ctx context.Context, creds *tokenCredentials) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, claudeProfileURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+creds.Access)
	req.Header.Set("Accept", "application/json")
	resp, err := oauthHTTPClient.Do(req)
	if err != nil {
		return formatOAuthHTTPError("Claude profile request failed", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 400 {
		return fmt.Errorf("profile request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		Account struct {
			HasClaudeMax bool   `json:"has_claude_max"`
			HasClaudePro bool   `json:"has_claude_pro"`
			Email        string `json:"email"`
			DisplayName  string `json:"display_name"`
			FullName     string `json:"full_name"`
		} `json:"account"`
		Organization struct {
			OrganizationType string `json:"organization_type"`
			RateLimitTier    string `json:"rate_limit_tier"`
			RateLimitAlt     string `json:"rateLimitTier"`
		} `json:"organization"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}
	switch {
	case payload.Account.HasClaudeMax:
		creds.SubscriptionType = "Max"
	case payload.Account.HasClaudePro:
		creds.SubscriptionType = "Pro"
	case payload.Organization.OrganizationType != "":
		creds.OrganizationType = payload.Organization.OrganizationType
		creds.SubscriptionType = formatOrganizationType(payload.Organization.OrganizationType)
	}
	if tier := firstNonEmpty(payload.Organization.RateLimitTier, payload.Organization.RateLimitAlt); tier != "" {
		creds.RateLimitTier = tier
	}
	creds.Email = payload.Account.Email
	creds.DisplayName = firstNonEmpty(payload.Account.DisplayName, payload.Account.FullName)
	return nil
}

func postJSON(ctx context.Context, rawURL string, payload any, dest any) error {
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	return doJSON(req, dest, "token request failed")
}

func postForm(ctx context.Context, rawURL string, form url.Values, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return doJSON(req, dest, "Codex token exchange failed")
}

func doJSON(req *http.Request, dest any, label string) error {
	resp, err := oauthHTTPClient.Do(req)
	if err != nil {
		return formatOAuthHTTPError(label, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 400 {
		return fmt.Errorf("%s (%d): %s", label, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return fmt.Errorf("response is not valid JSON: %w", err)
	}
	return nil
}

func writeClaudeOAuthCredentials(path string, creds tokenCredentials) error {
	var existing struct {
		ClaudeAiOauth map[string]any `json:"claudeAiOauth"`
	}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &existing)
	}
	prev := existing.ClaudeAiOauth
	oauth := map[string]any{
		"accessToken":  creds.Access,
		"refreshToken": creds.Refresh,
		"expiresAt":    creds.Expires,
	}
	setFirst(oauth, "subscriptionType", creds.SubscriptionType, stringFromMap(prev, "subscriptionType"))
	setFirst(oauth, "rateLimitTier", creds.RateLimitTier, stringFromMap(prev, "rateLimitTier"))
	if len(creds.Scopes) > 0 {
		oauth["scopes"] = creds.Scopes
	} else if prev != nil && prev["scopes"] != nil {
		oauth["scopes"] = prev["scopes"]
	}
	setFirst(oauth, "organizationType", creds.OrganizationType, stringFromMap(prev, "organizationType"))
	setFirst(oauth, "email", creds.Email, stringFromMap(prev, "email"))
	setFirst(oauth, "displayName", creds.DisplayName, stringFromMap(prev, "displayName"))
	return writeJSON0600(path, map[string]any{"claudeAiOauth": oauth})
}

func writeCodexOAuthCredentials(path string, creds tokenCredentials) error {
	return writeJSON0600(path, map[string]any{
		"auth_mode": "chatgpt",
		"tokens": map[string]any{
			"access_token":  creds.Access,
			"refresh_token": creds.Refresh,
			"account_id":    creds.AccountID,
		},
		"last_refresh": time.Now().Format(time.RFC3339),
	})
}

func writeJSON0600(path string, payload any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o600)
}

// claudeAuthPath returns clovapi's own Claude OAuth store. It never points at
// Claude Code's ~/.claude/.credentials.json — clovapi stays fully independent.
func claudeAuthPath() string {
	if p, err := config.ClaudeSubscriptionAuthPath(); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "clovapi", "subscription", "claude.json")
}

// codexAuthPath returns clovapi's own Codex OAuth store. It never points at
// Codex CLI's ~/.codex/auth.json — clovapi stays fully independent.
func codexAuthPath() string {
	if p, err := config.CodexSubscriptionAuthPath(); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "clovapi", "subscription", "codex.json")
}

func codexAccountIDFromAccessToken(accessToken string) string {
	parts := strings.Split(strings.TrimSpace(accessToken), ".")
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
	auth, _ := claims[codexAuthClaim].(map[string]any)
	id, _ := auth["chatgpt_account_id"].(string)
	return strings.TrimSpace(id)
}

func openBrowserURL(rawURL string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", rawURL).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL).Start()
	default:
		return exec.Command("xdg-open", rawURL).Start()
	}
}

func parseScopes(values ...any) []string {
	for _, v := range values {
		switch x := v.(type) {
		case string:
			if strings.TrimSpace(x) == "" {
				continue
			}
			return strings.Fields(x)
		case []any:
			out := make([]string, 0, len(x))
			for _, item := range x {
				if s := strings.TrimSpace(fmt.Sprint(item)); s != "" {
					out = append(out, s)
				}
			}
			if len(out) > 0 {
				return out
			}
		}
	}
	return nil
}

func formatOrganizationType(orgType string) string {
	raw := strings.ToLower(strings.TrimSpace(orgType))
	switch {
	case raw == "":
		return ""
	case strings.Contains(raw, "max"):
		return "Max"
	case strings.Contains(raw, "pro"):
		return "Pro"
	case strings.Contains(raw, "team"):
		return "Team"
	case strings.Contains(raw, "enterprise"):
		return "Enterprise"
	case strings.Contains(raw, "free") || raw == "claude_ai":
		return "Free"
	default:
		return strings.ReplaceAll(strings.TrimPrefix(raw, "claude_"), "_", " ")
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

func stringFromMap(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

func setFirst(m map[string]any, key string, values ...string) {
	if v := firstNonEmpty(values...); v != "" {
		m[key] = v
	}
}

var errCallbackCancelled = errors.New("login cancelled")

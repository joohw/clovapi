package platformbackend

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

const sessionCookie = "clovapi_session"

var codePattern = regexp.MustCompile(`^\d{6}$`)

func normalizeEmail(value string) (string, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	address, err := mail.ParseAddress(value)
	return value, err == nil && address.Address == value && len(value) <= 254 && strings.Contains(value, ".")
}

func (a *API) authCode(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	if !a.allowedOrigin(r) {
		writeJSON(w, 403, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if decodeJSON(w, r, 4096, &body) != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_email"})
		return
	}
	email, ok := normalizeEmail(body.Email)
	if !ok {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_email"})
		return
	}
	if len(a.config.AuthSecret) < 32 || a.config.ResendAPIKey == "" || a.config.ResendFrom == "" {
		writeJSON(w, 503, map[string]any{"ok": false, "error": "mail_unavailable"})
		return
	}
	now := a.store.now().UTC()
	var created string
	err := a.store.db.QueryRowContext(r.Context(), "SELECT created_at FROM auth_codes WHERE email=? ORDER BY created_at DESC LIMIT 1", email).Scan(&created)
	if err == nil {
		if at, parseErr := time.Parse(time.RFC3339Nano, created); parseErr == nil && now.Sub(at) < time.Minute {
			writeJSON(w, 429, map[string]any{"ok": false, "error": "rate_limited"})
			return
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	codeNumber, err := randNumber(1_000_000)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	code := fmt.Sprintf("%06d", codeNumber)
	id := uuid.NewString()
	mac := hmac.New(sha256.New, []byte(a.config.AuthSecret))
	mac.Write([]byte(email + ":" + code))
	codeHash := hex.EncodeToString(mac.Sum(nil))
	_, err = a.store.db.ExecContext(r.Context(), "INSERT INTO auth_codes(id,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)", id, email, codeHash, now.Add(10*time.Minute).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	if err = a.sendCode(r.Context(), id, email, code); err != nil {
		_, _ = a.store.db.Exec("DELETE FROM auth_codes WHERE id=?", id)
		writeJSON(w, 503, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "email": email})
}

func randNumber(max int) (int, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0, err
	}
	return int((uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])) % uint32(max)), nil
}

func (a *API) sendCode(ctx context.Context, id, email, code string) error {
	payload := map[string]any{"from": a.config.ResendFrom, "to": []string{email}, "subject": "你的 clovapi 登录验证码", "text": "你的 clovapi 登录验证码是 " + code + "。验证码 10 分钟内有效，请勿转发。", "html": "<div style=\"font-family:Arial,sans-serif;color:#272420\"><h2>登录 clovapi</h2><p>你的验证码是：</p><p style=\"font-size:28px;letter-spacing:6px;font-weight:700\">" + code + "</p><p>验证码 10 分钟内有效，请勿转发。</p></div>"}
	body, _ := json.Marshal(payload)
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return errors.New("mail_unavailable")
	}
	req.Header.Set("Authorization", "Bearer "+a.config.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "clovapi-login-"+id)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return errors.New("mail_unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return errors.New("mail_auth_failed")
	}
	if resp.StatusCode == 403 {
		return errors.New("mail_domain_unverified")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return errors.New("mail_unavailable")
	}
	return nil
}

func (a *API) authVerify(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	if !a.allowedOrigin(r) {
		writeJSON(w, 403, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	var body struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if decodeJSON(w, r, 4096, &body) != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_code"})
		return
	}
	email, ok := normalizeEmail(body.Email)
	if !ok || !codePattern.MatchString(body.Code) {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_code"})
		return
	}
	now := a.store.now().UTC()
	tx, err := a.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	defer tx.Rollback()
	var id, expected string
	var attempts int
	err = tx.QueryRow("SELECT id,code_hash,attempts FROM auth_codes WHERE email=? AND consumed_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1", email, now.Format(time.RFC3339Nano)).Scan(&id, &expected, &attempts)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "code_expired"})
		return
	}
	if err != nil || attempts >= 5 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_code"})
		return
	}
	_, _ = tx.Exec("UPDATE auth_codes SET attempts=attempts+1 WHERE id=?", id)
	mac := hmac.New(sha256.New, []byte(a.config.AuthSecret))
	mac.Write([]byte(email + ":" + body.Code))
	actual := hex.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) != 1 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_code"})
		return
	}
	var userID string
	err = tx.QueryRow("SELECT id FROM users WHERE email=?", email).Scan(&userID)
	stamp := now.Format(time.RFC3339Nano)
	if errors.Is(err, sql.ErrNoRows) {
		userID = uuid.NewString()
		_, err = tx.Exec("INSERT INTO users(id,email,created_at,last_login_at) VALUES(?,?,?,?)", userID, email, stamp, stamp)
	} else if err == nil {
		_, err = tx.Exec("UPDATE users SET last_login_at=? WHERE id=?", stamp, userID)
	}
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	_, _ = tx.Exec("UPDATE auth_codes SET consumed_at=? WHERE email=? AND consumed_at IS NULL", stamp, email)
	_, _ = tx.Exec("DELETE FROM sessions WHERE user_id=? OR expires_at<=?", userID, stamp)
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	token := base64.RawURLEncoding.EncodeToString(secret)
	expires := now.Add(30 * 24 * time.Hour)
	_, err = tx.Exec("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)", uuid.NewString(), userID, hash(token), expires.Format(time.RFC3339Nano), stamp, stamp)
	if err != nil || tx.Commit() != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: a.config.SecureCookies, SameSite: http.SameSiteLaxMode, Expires: expires})
	writeJSON(w, 200, map[string]any{"ok": true, "user": map[string]string{"id": userID, "email": email}})
}

func (a *API) currentUser(r *http.Request) (string, string, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil || cookie.Value == "" {
		return "", "", false
	}
	var id, email string
	now := a.store.now().UTC().Format(time.RFC3339Nano)
	err = a.store.db.QueryRowContext(r.Context(), "SELECT sessions.user_id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?", hash(cookie.Value), now).Scan(&id, &email)
	return id, email, err == nil
}

func (a *API) authSession(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodGet) {
		return
	}
	id, email, ok := a.currentUser(r)
	if !ok {
		writeJSON(w, 401, map[string]any{"ok": false})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "user": map[string]string{"id": id, "email": email}})
}
func (a *API) authLogout(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	if !a.allowedOrigin(r) {
		writeJSON(w, 403, map[string]any{"ok": false})
		return
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		_, _ = a.store.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash=?", hash(cookie.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: a.config.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	writeJSON(w, 200, map[string]any{"ok": true})
}

package platformbackend

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestPlatformAPIUsesBackendSessionAndCreatesConsumerKey(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "platform.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := time.Date(2026, 9, 14, 8, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }
	stamp := now.Format(time.RFC3339Nano)
	token := "browser-session-token"
	if _, err = store.db.Exec("INSERT INTO users(id,email,created_at,last_login_at) VALUES('user-one','one@example.com',?,?)", stamp, stamp); err != nil {
		t.Fatal(err)
	}
	if _, err = store.db.Exec("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES('session-one','user-one',?,?,?,?)", hash(token), now.Add(time.Hour).Format(time.RFC3339Nano), stamp, stamp); err != nil {
		t.Fatal(err)
	}
	api := NewAPI(store, http.NotFoundHandler(), APIConfig{AuthSecret: "test-auth-secret-at-least-thirty-two-characters", PublicOrigin: "https://api.clovapi.com", AllowedOrigins: []string{"https://clovapi.com"}, SecureCookies: true})
	body := bytes.NewBufferString(`{"action":"create_key","name":"integration"}`)
	request := httptest.NewRequest(http.MethodPost, "https://api.clovapi.com/api/platform", body)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://clovapi.com")
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	response := httptest.NewRecorder()
	api.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "https://clovapi.com" {
		t.Fatal("missing credentialed CORS response")
	}
	var payload struct {
		OK         bool   `json:"ok"`
		CreatedKey string `json:"createdKey"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.OK || len(payload.CreatedKey) != 52 {
		t.Fatalf("payload=%+v", payload)
	}

	request = httptest.NewRequest(http.MethodPost, "https://api.clovapi.com/api/platform", bytes.NewBufferString(`{"action":"issue_cli_key","expectedUserId":"user-one"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://clovapi.com")
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	response = httptest.NewRecorder()
	api.ServeHTTP(response, request)
	var cli struct {
		CreatedCLIKey string `json:"createdCLIKey"`
	}
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &cli) != nil || cli.CreatedCLIKey == "" {
		t.Fatalf("CLI key response=%d %s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodPost, "https://api.clovapi.com/api/node/register", bytes.NewBufferString(`{"deviceId":"26e5b4bd-20d2-4f67-a3c0-0e4dcedb60bf","name":"test node"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+cli.CreatedCLIKey)
	response = httptest.NewRecorder()
	api.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("register response=%d %s", response.Code, response.Body.String())
	}
}

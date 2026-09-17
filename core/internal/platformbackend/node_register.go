package platformbackend

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var connectionPattern = regexp.MustCompile(`^clv_connect_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$`)

func (a *API) registerNode(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	authorization := r.Header.Get("Authorization")
	if !strings.HasPrefix(authorization, "Bearer ") {
		writeJSON(w, 401, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	key := strings.TrimPrefix(authorization, "Bearer ")
	var body struct {
		DeviceID   string `json:"deviceId"`
		Name       string `json:"name"`
		DailyLimit *int64 `json:"dailyLimit"`
	}
	if decodeJSON(w, r, 4096, &body) != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_request"})
		return
	}
	limit := int64(100)
	if body.DailyLimit != nil {
		limit = *body.DailyLimit
	}
	name := strings.TrimSpace(body.Name)
	if _, err := uuid.Parse(body.DeviceID); err != nil || name == "" || len(name) > 80 || strings.ContainsAny(name, "\x00\r\n\t") || limit < 1 || limit > 100000 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_request"})
		return
	}
	owner, err := a.connectionOwner(r, key)
	if err != nil {
		writeJSON(w, 401, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	device := strings.ToLower(body.DeviceID)
	tx, err := a.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSON(w, 503, map[string]any{"ok": false, "error": "backend_unavailable"})
		return
	}
	defer tx.Rollback()
	now := a.store.now().UTC()
	var currentOwner string
	if err = tx.QueryRow("SELECT user_id FROM cli_connection_keys WHERE key_hash=?", hash(key)).Scan(&currentOwner); err != nil || currentOwner != owner {
		writeJSON(w, 401, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	if !registrationAllowed(tx, "account:"+owner, 100, now) || !registrationAllowed(tx, "device:"+owner+":"+device, 30, now) {
		writeJSON(w, 429, map[string]any{"ok": false, "error": "rate_limited"})
		return
	}
	var nodeID string
	var budget, authVersion int64
	var salt, keyHash sql.NullString
	var revoked bool
	err = tx.QueryRow("SELECT id,daily_budget,auth_version,node_key_salt,node_key_hash,node_key_revoked FROM nodes WHERE user_id=? AND device_id=?", owner, device).Scan(&nodeID, &budget, &authVersion, &salt, &keyHash, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if err = tx.QueryRow("SELECT COUNT(*) FROM nodes WHERE user_id=?", owner).Scan(&count); err != nil {
			writeJSON(w, 503, map[string]any{"ok": false, "error": "backend_unavailable"})
			return
		}
		if count >= maxItems {
			writeJSON(w, 409, map[string]any{"ok": false, "error": "item_limit"})
			return
		}
		nodeID = uuid.NewString()
		saltBytes := make([]byte, 32)
		if _, err = rand.Read(saltBytes); err != nil {
			writeJSON(w, 503, map[string]any{"ok": false, "error": "backend_unavailable"})
			return
		}
		salt = sql.NullString{String: hex.EncodeToString(saltBytes), Valid: true}
		budget = limit
		stamp := now.Format(time.RFC3339Nano)
		_, err = tx.Exec("INSERT INTO nodes(id,user_id,device_id,name,model,daily_budget,reserve_percent,schedule,usage_day,created_at,node_key_salt) VALUES(?,?,?,?,'chat',?,0,'anytime',?,?,?)", nodeID, owner, device, name, budget, day(now), stamp, salt.String)
	}
	if err != nil {
		writeJSON(w, 503, map[string]any{"ok": false, "error": "backend_unavailable"})
		return
	}
	if !salt.Valid {
		saltBytes := make([]byte, 32)
		if _, err = rand.Read(saltBytes); err != nil {
			writeJSON(w, 503, map[string]any{"ok": false, "error": "backend_unavailable"})
			return
		}
		salt = sql.NullString{String: hex.EncodeToString(saltBytes), Valid: true}
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("clovapi:node:" + nodeID + ":" + salt.String + ":" + formatInt(authVersion)))
	nodeKey := "clv_node_" + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if revoked || keyHash.String != hash(nodeKey) {
		_, err = tx.Exec("UPDATE nodes SET node_key_hash=?,node_key_prefix=?,node_key_salt=?,node_key_revoked=0,accepting=0,last_seen_at=NULL,relay_connection_id=NULL,model_id='' WHERE id=?", hash(nodeKey), nodeKey[:17]+"…", salt.String, nodeID)
		if err == nil {
			_, err = tx.Exec("DELETE FROM node_models WHERE node_id=?", nodeID)
		}
		if err == nil {
			_, err = tx.Exec("UPDATE relay_requests SET state='cancelled',error_code='node_reconnected',finished_at=? WHERE node_id=? AND state='running'", now.UnixMilli(), nodeID)
		}
	}
	if err == nil {
		_, err = tx.Exec("UPDATE nodes SET name=? WHERE id=?", name, nodeID)
	}
	if err != nil || tx.Commit() != nil {
		writeJSON(w, 503, map[string]any{"ok": false, "error": "backend_unavailable"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "nodeId": nodeID, "key": nodeKey, "name": name, "dailyLimit": budget})
}

func (a *API) connectionOwner(r *http.Request, key string) (string, error) {
	match := connectionPattern.FindStringSubmatch(key)
	if match == nil || len(match[1]) > 2048 {
		return "", errors.New("invalid")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(match[1])
	if err != nil || base64.RawURLEncoding.EncodeToString(decoded) != match[1] {
		return "", errors.New("invalid")
	}
	encodedOrigin, err := normalizeOrigin(string(decoded))
	if err != nil {
		return "", err
	}
	publicOrigin, err := normalizeOrigin(a.config.PublicOrigin)
	if err != nil || encodedOrigin != publicOrigin {
		return "", errors.New("origin")
	}
	var owner string
	err = a.store.db.QueryRowContext(r.Context(), "SELECT user_id FROM cli_connection_keys WHERE key_hash=?", hash(key)).Scan(&owner)
	return owner, err
}

func registrationAllowed(tx *sql.Tx, bucket string, maximum int, now time.Time) bool {
	_, _ = tx.Exec("DELETE FROM node_registration_rates WHERE resets_at<=?", now.UnixMilli())
	key := hash(bucket)
	var count int
	err := tx.QueryRow("SELECT count FROM node_registration_rates WHERE bucket=?", key).Scan(&count)
	if err == nil && count >= maximum {
		return false
	}
	_, err = tx.Exec(`INSERT INTO node_registration_rates(bucket,count,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1`, key, now.Add(time.Minute).UnixMilli())
	return err == nil
}
func formatInt(value int64) string {
	if value == 0 {
		return "0"
	}
	digits := ""
	for value > 0 {
		digits = string(rune('0'+value%10)) + digits
		value /= 10
	}
	return digits
}

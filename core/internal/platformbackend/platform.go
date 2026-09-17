package platformbackend

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

const maxItems = 8

type platformError struct{ code string }

func (e *platformError) Error() string { return e.code }
func fail(code string) error           { return &platformError{code: code} }

func (a *API) platform(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST")
		writeJSON(w, 405, map[string]any{"ok": false, "error": "method_not_allowed"})
		return
	}
	userID, _, ok := a.currentUser(r)
	if !ok {
		writeJSON(w, 401, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	if r.Method == http.MethodGet {
		state, err := a.platformState(r, userID)
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "state": state})
		return
	}
	if !a.allowedOrigin(r) {
		writeJSON(w, 403, map[string]any{"ok": false, "error": "unauthorized"})
		return
	}
	var action map[string]any
	if decodeJSON(w, r, 8192, &action) != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "invalid_request"})
		return
	}
	createdKey, createdCLI, createdNode, err := a.applyPlatformAction(r, userID, action)
	if err != nil {
		code := "backend_error"
		status := 500
		var domain *platformError
		if errors.As(err, &domain) {
			code = domain.code
			status = 409
			if code == "invalid_request" {
				status = 400
			} else if code == "unauthorized" {
				status = 403
			}
		}
		writeJSON(w, status, map[string]any{"ok": false, "error": code})
		return
	}
	state, err := a.platformState(r, userID)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": "backend_error"})
		return
	}
	result := map[string]any{"ok": true, "state": state}
	if createdKey != "" {
		result["createdKey"] = createdKey
	}
	if createdCLI != "" {
		result["createdCLIKey"] = createdCLI
	}
	if createdNode != nil {
		result["createdNodeKey"] = createdNode
	}
	writeJSON(w, 200, result)
}

func (a *API) platformState(r *http.Request, userID string) (map[string]any, error) {
	now := a.store.now().UTC()
	stamp := now.Format(time.RFC3339Nano)
	_, err := a.store.db.ExecContext(r.Context(), "INSERT OR IGNORE INTO account_balances(user_id,created_at) VALUES(?,?)", userID, stamp)
	if err != nil {
		return nil, err
	}
	var free, credits int64
	if err = a.store.db.QueryRowContext(r.Context(), "SELECT free_balance,credit_balance FROM account_balances WHERE user_id=?", userID).Scan(&free, &credits); err != nil {
		return nil, err
	}
	keys := []map[string]any{}
	rows, err := a.store.db.QueryContext(r.Context(), "SELECT id,name,key_prefix,revoked,created_at FROM api_keys WHERE user_id=? ORDER BY created_at", userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, name, prefix, created string
		var revoked bool
		if err = rows.Scan(&id, &name, &prefix, &revoked, &created); err != nil {
			rows.Close()
			return nil, err
		}
		keys = append(keys, map[string]any{"id": id, "name": name, "prefix": prefix, "revoked": revoked, "createdAt": created})
	}
	rows.Close()
	nodes := []map[string]any{}
	type rawNode struct {
		id, name, kind, schedule, usageDay, modelID string
		budget, reserve, used                       int64
		paused, keyRevoked                          bool
		device, prefix                              sql.NullString
		seen                                        sql.NullInt64
	}
	rawNodes := []rawNode{}
	rows, err = a.store.db.QueryContext(r.Context(), `SELECT id,name,model,daily_budget,reserve_percent,schedule,paused,used,usage_day,model_id,device_id,node_key_prefix,node_key_revoked,last_seen_at FROM nodes WHERE user_id=? ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var node rawNode
		if err = rows.Scan(&node.id, &node.name, &node.kind, &node.budget, &node.reserve, &node.schedule, &node.paused, &node.used, &node.usageDay, &node.modelID, &node.device, &node.prefix, &node.keyRevoked, &node.seen); err != nil {
			rows.Close()
			return nil, err
		}
		rawNodes = append(rawNodes, node)
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	for _, node := range rawNodes {
		modelRows, e := a.store.db.QueryContext(r.Context(), "SELECT model_id FROM node_models WHERE node_id=? ORDER BY model_id", node.id)
		if e != nil {
			rows.Close()
			return nil, e
		}
		models := []string{}
		for modelRows.Next() {
			var model string
			if modelRows.Scan(&model) == nil {
				models = append(models, model)
			}
		}
		modelRows.Close()
		if node.usageDay != day(now) {
			node.used = 0
		}
		var lastSeen any
		if node.seen.Valid {
			lastSeen = time.UnixMilli(node.seen.Int64).UTC().Format(time.RFC3339Nano)
		}
		nodes = append(nodes, map[string]any{"id": node.id, "name": node.name, "model": node.kind, "budget": node.budget, "reserve": node.reserve, "schedule": node.schedule, "paused": node.paused, "used": node.used, "day": day(now), "modelId": node.modelID, "models": models, "deviceId": nullable(node.device), "keyPrefix": nullable(node.prefix), "keyRevoked": node.keyRevoked, "lastSeenAt": lastSeen, "online": !node.keyRevoked && node.seen.Valid && node.seen.Int64 > now.Add(-30*time.Second).UnixMilli()})
	}
	entries := []map[string]any{}
	rows, err = a.store.db.QueryContext(r.Context(), "SELECT id,created_at,kind,source,free_delta,credit_delta FROM credit_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 60", userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, at, kind, source string
		var fd, cd int64
		if err = rows.Scan(&id, &at, &kind, &source, &fd, &cd); err != nil {
			rows.Close()
			return nil, err
		}
		entries = append(entries, map[string]any{"id": id, "at": at, "kind": kind, "source": source, "freeDelta": fd, "creditDelta": cd})
	}
	rows.Close()
	var keyHash, prefix, ciphertext, created string
	var cli any
	err = a.store.db.QueryRowContext(r.Context(), "SELECT key_hash,key_prefix,COALESCE(key_ciphertext,''),created_at FROM cli_connection_keys WHERE user_id=?", userID).Scan(&keyHash, &prefix, &ciphertext, &created)
	if err == nil {
		plain := a.decryptCLIKey(userID, ciphertext, keyHash)
		if value, ok := plain.(string); ok && !connectionKeyUsesOrigin(value, a.config.PublicOrigin) {
			plain = nil
		}
		cli = map[string]any{"prefix": prefix, "createdAt": created, "key": plain}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return map[string]any{"version": 1, "userId": userID, "free": free, "credits": credits, "cliKey": cli, "keys": keys, "nodes": nodes, "entries": entries}, nil
}

func nullable(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}
func actionString(action map[string]any, key string, max int) (string, error) {
	value, ok := action[key].(string)
	value = strings.TrimSpace(value)
	if !ok || value == "" || len(value) > max {
		return "", fail("invalid_request")
	}
	return value, nil
}
func actionInt(action map[string]any, key string, min, max int64) (int64, error) {
	value, err := integer(action, key, max)
	if err != nil || value < min {
		return 0, fail("invalid_request")
	}
	return value, nil
}

func (a *API) applyPlatformAction(r *http.Request, userID string, action map[string]any) (string, string, map[string]string, error) {
	kind, _ := action["action"].(string)
	tx, err := a.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		return "", "", nil, err
	}
	defer tx.Rollback()
	now := a.store.now().UTC()
	stamp := now.Format(time.RFC3339Nano)
	_, err = tx.Exec("INSERT OR IGNORE INTO account_balances(user_id,created_at) VALUES(?,?)", userID, stamp)
	if err != nil {
		return "", "", nil, err
	}
	var createdKey, createdCLI string
	var createdNode map[string]string
	switch kind {
	case "ensure_cli_key", "issue_cli_key", "revoke_cli_key":
		expected, e := actionString(action, "expectedUserId", 80)
		if e != nil {
			return "", "", nil, e
		}
		if expected != userID {
			return "", "", nil, fail("account_changed")
		}
		if kind == "revoke_cli_key" {
			_, err = tx.Exec("DELETE FROM cli_connection_keys WHERE user_id=?", userID)
			break
		}
		if a.config.PublicOrigin == "" {
			return "", "", nil, fail("invalid_request")
		}
		origin, e := normalizeOrigin(a.config.PublicOrigin)
		if e != nil {
			return "", "", nil, e
		}
		if kind == "ensure_cli_key" {
			var existingHash, existingCipher string
			e = tx.QueryRow("SELECT key_hash,COALESCE(key_ciphertext,'') FROM cli_connection_keys WHERE user_id=?", userID).Scan(&existingHash, &existingCipher)
			if e == nil {
				if existing, ok := a.decryptCLIKey(userID, existingCipher, existingHash).(string); ok && connectionKeyUsesOrigin(existing, origin) {
					break
				}
			}
		}
		secretBytes := make([]byte, 16)
		if _, err = rand.Read(secretBytes); err != nil {
			return "", "", nil, err
		}
		createdCLI = "clv_connect_" + base64.RawURLEncoding.EncodeToString([]byte(origin)) + "." + base64.RawURLEncoding.EncodeToString(secretBytes)
		encrypted, e := a.encryptCLIKey(userID, createdCLI)
		if e != nil {
			return "", "", nil, e
		}
		_, err = tx.Exec(`INSERT INTO cli_connection_keys(user_id,key_hash,key_prefix,key_ciphertext,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET key_hash=excluded.key_hash,key_prefix=excluded.key_prefix,key_ciphertext=excluded.key_ciphertext,created_at=excluded.created_at`, userID, hash(createdCLI), "clv_connect_…"+createdCLI[len(createdCLI)-8:], encrypted, stamp)
	case "create_key":
		name, e := actionString(action, "name", 36)
		if e != nil {
			return "", "", nil, e
		}
		var count int
		if err = tx.QueryRow("SELECT COUNT(*) FROM api_keys WHERE user_id=?", userID).Scan(&count); err != nil {
			return "", "", nil, err
		}
		if count >= maxItems {
			return "", "", nil, fail("item_limit")
		}
		secret := make([]byte, 32)
		if _, err = rand.Read(secret); err != nil {
			return "", "", nil, err
		}
		createdKey = "clv_live_" + base64.RawURLEncoding.EncodeToString(secret)
		_, err = tx.Exec("INSERT INTO api_keys(id,user_id,name,key_prefix,key_hash,created_at) VALUES(?,?,?,?,?,?)", uuid.NewString(), userID, name, createdKey[:17]+"…", hash(createdKey), stamp)
	case "revoke_key":
		id, e := actionString(action, "id", 80)
		if e != nil {
			return "", "", nil, e
		}
		result, e := tx.Exec("UPDATE api_keys SET revoked=1 WHERE id=? AND user_id=?", id, userID)
		if e != nil {
			return "", "", nil, e
		}
		changed, _ := result.RowsAffected()
		if changed == 0 {
			return "", "", nil, fail("not_found")
		}
		_, err = tx.Exec("UPDATE relay_requests SET state='cancelled',error_code='key_revoked',finished_at=? WHERE api_key_id=? AND state='running'", now.UnixMilli(), id)
	case "create_node":
		name, e := actionString(action, "name", 36)
		if e != nil {
			return "", "", nil, e
		}
		model, e := actionString(action, "modelId", 160)
		if e != nil || !modelPattern.MatchString(model) {
			return "", "", nil, fail("invalid_request")
		}
		budget, e := actionInt(action, "budget", 1, 100000)
		if e != nil {
			return "", "", nil, e
		}
		var count int
		if err = tx.QueryRow("SELECT COUNT(*) FROM nodes WHERE user_id=?", userID).Scan(&count); err != nil {
			return "", "", nil, err
		}
		if count >= maxItems {
			return "", "", nil, fail("item_limit")
		}
		id := uuid.NewString()
		secret := make([]byte, 32)
		if _, err = rand.Read(secret); err != nil {
			return "", "", nil, err
		}
		nodeKey := "clv_node_" + base64.RawURLEncoding.EncodeToString(secret)
		_, err = tx.Exec("INSERT INTO nodes(id,user_id,name,model,model_id,daily_budget,reserve_percent,schedule,usage_day,created_at,node_key_hash,node_key_prefix,node_key_revoked) VALUES(?,?,?,'chat',?,?,0,'anytime',?,?,?,?,0)", id, userID, name, model, budget, day(now), stamp, hash(nodeKey), nodeKey[:17]+"…")
		if err == nil {
			_, err = tx.Exec("INSERT INTO node_models(node_id,model_id) VALUES(?,?)", id, model)
		}
		createdNode = map[string]string{"nodeId": id, "key": nodeKey}
	case "update_node":
		id, e := actionString(action, "id", 80)
		if e != nil {
			return "", "", nil, e
		}
		budget, e := actionInt(action, "budget", 1, 100000)
		if e != nil {
			return "", "", nil, e
		}
		err = mustChange(tx.Exec("UPDATE nodes SET daily_budget=? WHERE id=? AND user_id=?", budget, id, userID))
	case "toggle_node":
		id, e := actionString(action, "id", 80)
		if e != nil {
			return "", "", nil, e
		}
		err = mustChange(tx.Exec("UPDATE nodes SET paused=CASE paused WHEN 1 THEN 0 ELSE 1 END WHERE id=? AND user_id=?", id, userID))
	case "issue_node_key", "revoke_node_key":
		id, e := actionString(action, "id", 80)
		if e != nil {
			return "", "", nil, e
		}
		if kind == "issue_node_key" {
			secret := make([]byte, 32)
			if _, err = rand.Read(secret); err != nil {
				return "", "", nil, err
			}
			nodeKey := "clv_node_" + base64.RawURLEncoding.EncodeToString(secret)
			err = mustChange(tx.Exec("UPDATE nodes SET node_key_hash=?,node_key_prefix=?,node_key_revoked=0,accepting=0,last_seen_at=NULL,relay_connection_id=NULL,auth_version=auth_version+1 WHERE id=? AND user_id=?", hash(nodeKey), nodeKey[:17]+"…", id, userID))
			createdNode = map[string]string{"nodeId": id, "key": nodeKey}
		} else {
			err = mustChange(tx.Exec("UPDATE nodes SET node_key_revoked=1,accepting=0,last_seen_at=NULL,relay_connection_id=NULL,auth_version=auth_version+1 WHERE id=? AND user_id=?", id, userID))
		}
		if err == nil {
			_, err = tx.Exec("UPDATE relay_requests SET state='cancelled',error_code='node_revoked',finished_at=? WHERE node_id=? AND state='running'", now.UnixMilli(), id)
		}
	default:
		return "", "", nil, fail("invalid_request")
	}
	if err != nil {
		return "", "", nil, err
	}
	if err = tx.Commit(); err != nil {
		return "", "", nil, err
	}
	a.notifyPlatformChange(kind, action)
	return createdKey, createdCLI, createdNode, nil
}

func (a *API) notifyPlatformChange(kind string, action map[string]any) {
	sink, ok := a.relay.(interface {
		NotifyConsumer(string)
		NotifyNode(string, bool, *bool, *int64)
	})
	if !ok {
		return
	}
	id, _ := action["id"].(string)
	switch kind {
	case "revoke_key":
		sink.NotifyConsumer(id)
	case "revoke_node_key", "issue_node_key":
		sink.NotifyNode(id, true, nil, nil)
	case "update_node":
		if budget, err := actionInt(action, "budget", 1, 100000); err == nil {
			sink.NotifyNode(id, false, nil, &budget)
		}
	case "toggle_node":
		var paused bool
		if a.store.db.QueryRow("SELECT paused FROM nodes WHERE id=?", id).Scan(&paused) == nil {
			sink.NotifyNode(id, false, &paused, nil)
		}
	}
}

func mustChange(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	count, e := result.RowsAffected()
	if e != nil {
		return e
	}
	if count == 0 {
		return fail("not_found")
	}
	return nil
}
func normalizeOrigin(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", fail("invalid_request")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || strings.HasPrefix(u.Hostname(), "127."))) {
		return "", fail("invalid_request")
	}
	return u.Scheme + "://" + u.Host, nil
}

func connectionKeyUsesOrigin(key, origin string) bool {
	match := connectionPattern.FindStringSubmatch(key)
	if match == nil || len(match[1]) > 2048 {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(match[1])
	if err != nil || base64.RawURLEncoding.EncodeToString(decoded) != match[1] {
		return false
	}
	value, err := normalizeOrigin(string(decoded))
	return err == nil && value == origin
}

func (a *API) encryptionKey() []byte {
	sum := sha256.Sum256([]byte("clovapi:cli-connection-key:v1\x00" + a.config.AuthSecret))
	return sum[:]
}
func (a *API) encryptCLIKey(userID, plain string) (string, error) {
	block, err := aes.NewCipher(a.encryptionKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(iv); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, iv, []byte(plain), []byte(userID))
	tagStart := len(sealed) - gcm.Overhead()
	return "v1." + base64.RawURLEncoding.EncodeToString(iv) + "." + base64.RawURLEncoding.EncodeToString(sealed[tagStart:]) + "." + base64.RawURLEncoding.EncodeToString(sealed[:tagStart]), nil
}
func (a *API) decryptCLIKey(userID, value, wantHash string) any {
	parts := strings.Split(value, ".")
	if len(parts) != 4 || parts[0] != "v1" {
		return nil
	}
	iv, e1 := base64.RawURLEncoding.DecodeString(parts[1])
	tag, e2 := base64.RawURLEncoding.DecodeString(parts[2])
	body, e3 := base64.RawURLEncoding.DecodeString(parts[3])
	if e1 != nil || e2 != nil || e3 != nil {
		return nil
	}
	block, err := aes.NewCipher(a.encryptionKey())
	if err != nil {
		return nil
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(tag) != gcm.Overhead() {
		return nil
	}
	plain, err := gcm.Open(nil, iv, append(body, tag...), []byte(userID))
	if err != nil || hash(string(plain)) != wantHash {
		return nil
	}
	return string(plain)
}

func sortedStrings(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

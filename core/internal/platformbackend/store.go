// Package platformbackend owns the durable platform state used by the Go
// control plane and Relay data plane.
package platformbackend

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/relay"
	_ "modernc.org/sqlite"
)

const (
	nodeConcurrency = 5
	requestTimeout  = 120 * time.Second
)

var (
	idPattern    = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	modelPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,159}$`)
)

type Store struct {
	db  *sql.DB
	now func() time.Time
}

type nodeRow struct {
	id, usageDay, connection string
	dailyLimit, used         int64
	paused, accepting        bool
	lastSeen                 sql.NullInt64
}

func Open(databasePath string) (*Store, error) {
	if strings.TrimSpace(databasePath) == "" {
		return nil, errors.New("database path is required")
	}
	abs, err := filepath.Abs(databasePath)
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Dir(abs), 0o750); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", abs)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	for _, pragma := range []string{"PRAGMA journal_mode=WAL", "PRAGMA foreign_keys=ON", "PRAGMA busy_timeout=5000"} {
		if _, err = db.Exec(pragma); err != nil {
			db.Close()
			return nil, err
		}
	}
	s := &Store{db: db, now: time.Now}
	if err = s.initialize(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) initialize() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_codes_email_created ON auth_codes(email, created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  free_balance INTEGER NOT NULL DEFAULT 0, credit_balance INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, key_prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
  revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'chat', daily_budget INTEGER NOT NULL,
  reserve_percent INTEGER NOT NULL DEFAULT 0, schedule TEXT NOT NULL DEFAULT 'anytime',
  paused INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0,
  usage_day TEXT NOT NULL, created_at TEXT NOT NULL, model_id TEXT NOT NULL DEFAULT '',
  node_key_hash TEXT, node_key_prefix TEXT, node_key_revoked INTEGER NOT NULL DEFAULT 1,
  last_seen_at INTEGER, accepting INTEGER NOT NULL DEFAULT 0, device_id TEXT,
  auth_version INTEGER NOT NULL DEFAULT 0, node_key_salt TEXT, relay_connection_id TEXT
);
CREATE TABLE IF NOT EXISTS cli_connection_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, key_ciphertext TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL,
  free_delta INTEGER NOT NULL, credit_delta INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS node_registration_rates (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_key_hash ON nodes(node_key_hash);
CREATE TABLE IF NOT EXISTS node_models (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE, model_id TEXT NOT NULL,
  PRIMARY KEY (node_id, model_id)
);
CREATE INDEX IF NOT EXISTS node_models_model ON node_models(model_id, node_id);
CREATE TABLE IF NOT EXISTS relay_requests (
  id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL, model TEXT NOT NULL, state TEXT NOT NULL,
  created_at INTEGER NOT NULL, deadline INTEGER NOT NULL, finished_at INTEGER,
  response_status INTEGER, response_bytes INTEGER NOT NULL DEFAULT 0, error_code TEXT
);
CREATE INDEX IF NOT EXISTS relay_request_node ON relay_requests(node_id, state);
CREATE INDEX IF NOT EXISTS relay_request_user ON relay_requests(user_id, state);
CREATE INDEX IF NOT EXISTS relay_request_running_deadline ON relay_requests(deadline) WHERE state = 'running';
CREATE TABLE IF NOT EXISTS relay_cancelled_admissions (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS model_usage_minutes (
  model_id TEXT NOT NULL, bucket_start INTEGER NOT NULL, requests INTEGER NOT NULL,
  PRIMARY KEY (model_id, bucket_start)
);
CREATE TABLE IF NOT EXISTS model_usage_coverage (id INTEGER PRIMARY KEY CHECK (id = 1), history_since INTEGER NOT NULL);
INSERT OR IGNORE INTO model_usage_coverage(id, history_since) VALUES (1, unixepoch('now') * 1000);
`)
	return err
}

func (s *Store) Apply(ctx context.Context, action string, input map[string]any) (relay.ControlReply, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return relay.ControlReply{}, relay.NewControlError(503, "backend_unavailable")
	}
	defer tx.Rollback()
	now := s.now().UTC()
	if err = sweep(tx, now); err != nil {
		return relay.ControlReply{}, relay.NewControlError(503, "backend_unavailable")
	}
	var result relay.ControlReply
	switch action {
	case "model_catalog_usage":
		result, err = catalogUsage(tx, now)
	case "consumer":
		result, err = consumer(tx, input, now)
	case "connect":
		result, err = connect(tx, input, now)
	case "sync":
		result, err = syncNode(tx, input, now)
	case "disconnect":
		result, err = disconnect(tx, input, now)
	case "reserve":
		result, err = reserve(tx, input, now)
	case "complete":
		result, err = complete(tx, input, now)
	default:
		err = relay.NewControlError(400, "invalid_request")
	}
	if err != nil {
		return relay.ControlReply{}, err
	}
	if err = tx.Commit(); err != nil {
		return relay.ControlReply{}, relay.NewControlError(503, "backend_unavailable")
	}
	return result, nil
}

func sweep(tx *sql.Tx, now time.Time) error {
	ms := now.UnixMilli()
	if _, err := tx.Exec("UPDATE relay_requests SET state='failed', error_code='request_timeout', finished_at=? WHERE state='running' AND deadline<=?", ms, ms); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM relay_requests WHERE state<>'running' AND finished_at<?", ms-86_400_000); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM model_usage_minutes WHERE bucket_start<?", ms-8*86_400_000); err != nil {
		return err
	}
	_, err := tx.Exec("DELETE FROM relay_cancelled_admissions WHERE expires_at<=?", ms)
	return err
}

func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func day(now time.Time) string { return now.Format(time.DateOnly) }

func text(input map[string]any, key string, max int) (string, error) {
	value, ok := input[key].(string)
	if !ok || value == "" || len(value) > max || strings.ContainsAny(value, "\x00\r\n\t") {
		return "", relay.NewControlError(400, "invalid_request")
	}
	return value, nil
}
func identifier(input map[string]any, key string) (string, error) {
	value, err := text(input, key, 128)
	if err != nil || !idPattern.MatchString(value) {
		return "", relay.NewControlError(400, "invalid_request")
	}
	return value, nil
}
func integer(input map[string]any, key string, max int64) (int64, error) {
	var value int64
	switch v := input[key].(type) {
	case int:
		value = int64(v)
	case int64:
		value = v
	case float64:
		if math.Trunc(v) != v {
			return 0, relay.NewControlError(400, "invalid_request")
		}
		value = int64(v)
	default:
		return 0, relay.NewControlError(400, "invalid_request")
	}
	if value < 0 || value > max {
		return 0, relay.NewControlError(400, "invalid_request")
	}
	return value, nil
}

func readNode(tx *sql.Tx, key string) (nodeRow, error) {
	if !regexp.MustCompile(`^clv_node_[A-Za-z0-9_-]{43}$`).MatchString(key) {
		return nodeRow{}, relay.NewControlError(401, "unauthorized")
	}
	var n nodeRow
	var paused, accepting int
	err := tx.QueryRow(`SELECT id,daily_budget,used,usage_day,paused,accepting,COALESCE(relay_connection_id,''),last_seen_at FROM nodes WHERE node_key_hash=? AND node_key_revoked=0`, hash(key)).Scan(&n.id, &n.dailyLimit, &n.used, &n.usageDay, &paused, &accepting, &n.connection, &n.lastSeen)
	if errors.Is(err, sql.ErrNoRows) {
		return n, relay.NewControlError(401, "unauthorized")
	}
	if err != nil {
		return n, relay.NewControlError(503, "backend_unavailable")
	}
	n.paused, n.accepting = paused != 0, accepting != 0
	return n, nil
}

func nodeFromInput(tx *sql.Tx, input map[string]any) (nodeRow, string, error) {
	key, err := text(input, "nodeKey", 128)
	if err != nil {
		return nodeRow{}, "", err
	}
	n, err := readNode(tx, key)
	if err != nil {
		return n, "", err
	}
	connection, err := identifier(input, "connectionId")
	if err != nil {
		return n, "", err
	}
	if n.connection != connection {
		return n, connection, relay.NewControlError(409, "connection_replaced")
	}
	return n, connection, nil
}

func policy(n nodeRow, now time.Time) relay.ControlReply {
	used := n.used
	if n.usageDay != day(now) {
		used = 0
	}
	return relay.ControlReply{OK: true, NodeID: n.id, DailyLimit: n.dailyLimit, Used: used, Paused: n.paused, Concurrency: nodeConcurrency}
}

func consumer(tx *sql.Tx, input map[string]any, now time.Time) (relay.ControlReply, error) {
	key, err := text(input, "consumerKey", 128)
	if err != nil || !regexp.MustCompile(`^clv_live_[A-Za-z0-9_-]{43}$`).MatchString(key) {
		return relay.ControlReply{}, relay.NewControlError(401, "unauthorized")
	}
	var id, user string
	err = tx.QueryRow("SELECT id,user_id FROM api_keys WHERE key_hash=? AND revoked=0", hash(key)).Scan(&id, &user)
	if errors.Is(err, sql.ErrNoRows) {
		return relay.ControlReply{}, relay.NewControlError(401, "unauthorized")
	}
	if err != nil {
		return relay.ControlReply{}, relay.NewControlError(503, "backend_unavailable")
	}
	if _, err = tx.Exec("UPDATE api_keys SET last_used_at=? WHERE id=?", now.Format(time.RFC3339Nano), id); err != nil {
		return relay.ControlReply{}, relay.NewControlError(503, "backend_unavailable")
	}
	return relay.ControlReply{OK: true, ConsumerID: id, UserID: user}, nil
}

func connect(tx *sql.Tx, input map[string]any, now time.Time) (relay.ControlReply, error) {
	key, err := text(input, "nodeKey", 128)
	if err != nil {
		return relay.ControlReply{}, err
	}
	n, err := readNode(tx, key)
	if err != nil {
		return relay.ControlReply{}, err
	}
	connection, err := identifier(input, "connectionId")
	if err != nil {
		return relay.ControlReply{}, err
	}
	if n.connection != connection {
		if _, err = tx.Exec("UPDATE relay_requests SET state='failed',error_code='node_disconnected',finished_at=? WHERE node_id=? AND state='running'", now.UnixMilli(), n.id); err != nil {
			return relay.ControlReply{}, err
		}
		if _, err = tx.Exec("UPDATE nodes SET relay_connection_id=?,accepting=0,last_seen_at=? WHERE id=?", connection, now.UnixMilli(), n.id); err != nil {
			return relay.ControlReply{}, err
		}
	}
	return policy(n, now), nil
}

func syncNode(tx *sql.Tx, input map[string]any, now time.Time) (relay.ControlReply, error) {
	n, connection, err := nodeFromInput(tx, input)
	if err != nil {
		return relay.ControlReply{}, err
	}
	paused, ok := input["paused"].(bool)
	if !ok {
		return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
	}
	remaining, err := integer(input, "remaining", 100_000)
	if err != nil {
		return relay.ControlReply{}, err
	}
	raw, ok := input["models"].([]string)
	if !ok {
		if values, yes := input["models"].([]any); yes {
			raw = make([]string, len(values))
			for i, value := range values {
				raw[i], ok = value.(string)
				if !ok {
					break
				}
			}
		}
	}
	if !ok || len(raw) > 256 {
		return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
	}
	unique := map[string]struct{}{}
	for _, model := range raw {
		if !modelPattern.MatchString(model) {
			return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
		}
		unique[model] = struct{}{}
	}
	models := make([]string, 0, len(unique))
	for model := range unique {
		models = append(models, model)
	}
	sort.Strings(models)
	if _, err = tx.Exec("DELETE FROM node_models WHERE node_id=?", n.id); err != nil {
		return relay.ControlReply{}, err
	}
	for _, model := range models {
		if _, err = tx.Exec("INSERT INTO node_models(node_id,model_id) VALUES(?,?)", n.id, model); err != nil {
			return relay.ControlReply{}, err
		}
	}
	first := ""
	if len(models) > 0 {
		first = models[0]
	}
	accepting := !paused && remaining > 0 && len(models) > 0
	if _, err = tx.Exec("UPDATE nodes SET model_id=?,accepting=?,last_seen_at=? WHERE id=?", first, accepting, now.UnixMilli(), n.id); err != nil {
		return relay.ControlReply{}, err
	}
	rows, err := tx.Query("SELECT id FROM relay_requests WHERE connection_id=? AND state IN ('cancelled','failed') AND finished_at>=? ORDER BY finished_at DESC LIMIT 1024", connection, now.Add(-requestTimeout).UnixMilli())
	if err != nil {
		return relay.ControlReply{}, err
	}
	defer rows.Close()
	cancellations := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			cancellations = append(cancellations, id)
		}
	}
	result := policy(n, now)
	result.CancelIDs = cancellations
	return result, rows.Err()
}

func disconnect(tx *sql.Tx, input map[string]any, now time.Time) (relay.ControlReply, error) {
	key, err := text(input, "nodeKey", 128)
	if err != nil {
		return relay.ControlReply{}, err
	}
	n, err := readNode(tx, key)
	if err != nil {
		return relay.ControlReply{}, err
	}
	connection, err := identifier(input, "connectionId")
	if err != nil {
		return relay.ControlReply{}, err
	}
	if _, err = tx.Exec("UPDATE nodes SET relay_connection_id=NULL,accepting=0,last_seen_at=NULL WHERE id=? AND relay_connection_id=?", n.id, connection); err != nil {
		return relay.ControlReply{}, err
	}
	_, err = tx.Exec("UPDATE relay_requests SET state='failed',error_code='node_disconnected',finished_at=? WHERE node_id=? AND connection_id=? AND state='running'", now.UnixMilli(), n.id, connection)
	return relay.ControlReply{OK: true}, err
}

func reserve(tx *sql.Tx, input map[string]any, now time.Time) (relay.ControlReply, error) {
	c, err := consumer(tx, input, now)
	if err != nil {
		return relay.ControlReply{}, err
	}
	n, connection, err := nodeFromInput(tx, input)
	if err != nil {
		return relay.ControlReply{}, err
	}
	requestID, err := identifier(input, "requestId")
	if err != nil {
		return relay.ControlReply{}, err
	}
	model, err := text(input, "model", 160)
	if err != nil || !modelPattern.MatchString(model) {
		return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
	}
	deadline, err := integer(input, "deadline", math.MaxInt64)
	if err != nil || deadline <= now.UnixMilli() || deadline > now.Add(requestTimeout+time.Second).UnixMilli() {
		return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
	}
	var exists int
	if err = tx.QueryRow("SELECT 1 FROM relay_cancelled_admissions WHERE id=?", requestID).Scan(&exists); err == nil {
		return relay.ControlReply{}, relay.NewControlError(409, "request_conflict")
	} else if !errors.Is(err, sql.ErrNoRows) {
		return relay.ControlReply{}, err
	}
	var oldConnection, oldNode, oldKey, oldModel, state string
	err = tx.QueryRow("SELECT connection_id,node_id,api_key_id,model,state FROM relay_requests WHERE id=?", requestID).Scan(&oldConnection, &oldNode, &oldKey, &oldModel, &state)
	if err == nil {
		if oldConnection != connection || oldNode != n.id || oldKey != c.ConsumerID || oldModel != model || state != "running" {
			return relay.ControlReply{}, relay.NewControlError(409, "request_conflict")
		}
		return policy(n, now), nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return relay.ControlReply{}, err
	}
	if n.paused || !n.accepting || !n.lastSeen.Valid || n.lastSeen.Int64 < now.Add(-30*time.Second).UnixMilli() {
		return relay.ControlReply{}, relay.NewControlError(503, "model_unavailable")
	}
	if err = tx.QueryRow("SELECT 1 FROM node_models WHERE node_id=? AND model_id=?", n.id, model).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		return relay.ControlReply{}, relay.NewControlError(503, "model_unavailable")
	} else if err != nil {
		return relay.ControlReply{}, err
	}
	currentUsed := n.used
	if n.usageDay != day(now) {
		currentUsed = 0
	}
	if currentUsed >= n.dailyLimit {
		return relay.ControlReply{}, relay.NewControlError(429, "node_limit_reached")
	}
	for _, check := range []struct {
		query  string
		arg    any
		limit  int64
		code   string
		status int
	}{{"SELECT COUNT(*) FROM relay_requests WHERE node_id=? AND state='running'", n.id, 5, "node_busy", 503}, {"SELECT COUNT(*) FROM relay_requests WHERE user_id=? AND state='running'", c.UserID, 20, "capacity_exceeded", 429}, {"SELECT COUNT(*) FROM relay_requests WHERE state='running'", nil, 1024, "capacity_exceeded", 429}} {
		var count int64
		if check.arg == nil {
			err = tx.QueryRow(check.query).Scan(&count)
		} else {
			err = tx.QueryRow(check.query, check.arg).Scan(&count)
		}
		if err != nil {
			return relay.ControlReply{}, err
		}
		if count >= check.limit {
			return relay.ControlReply{}, relay.NewControlError(check.status, check.code)
		}
	}
	if _, err = tx.Exec("INSERT INTO relay_requests(id,node_id,user_id,api_key_id,connection_id,model,state,created_at,deadline) VALUES(?,?,?,?,?,?,'running',?,?)", requestID, n.id, c.UserID, c.ConsumerID, connection, model, now.UnixMilli(), deadline); err != nil {
		return relay.ControlReply{}, err
	}
	minute := now.UnixMilli() / 60_000 * 60_000
	if _, err = tx.Exec("INSERT INTO model_usage_minutes(model_id,bucket_start,requests) VALUES(?,?,1) ON CONFLICT(model_id,bucket_start) DO UPDATE SET requests=requests+1", model, minute); err != nil {
		return relay.ControlReply{}, err
	}
	currentUsed++
	if _, err = tx.Exec("UPDATE nodes SET used=?,usage_day=? WHERE id=?", currentUsed, day(now), n.id); err != nil {
		return relay.ControlReply{}, err
	}
	result := policy(n, now)
	result.Used = currentUsed
	return result, nil
}

func complete(tx *sql.Tx, input map[string]any, now time.Time) (relay.ControlReply, error) {
	requestID, err := identifier(input, "requestId")
	if err != nil {
		return relay.ControlReply{}, err
	}
	connection, err := identifier(input, "connectionId")
	if err != nil {
		return relay.ControlReply{}, err
	}
	state, err := text(input, "state", 16)
	if err != nil || (state != "completed" && state != "failed" && state != "cancelled") {
		return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
	}
	status, err := integer(input, "status", 599)
	if err != nil || (status != 0 && status < 200) {
		return relay.ControlReply{}, relay.NewControlError(400, "invalid_request")
	}
	bytes, err := integer(input, "bytes", 8*1024*1024)
	if err != nil {
		return relay.ControlReply{}, err
	}
	code, _ := input["errorCode"].(string)
	allowed := map[string]bool{"": true, "upstream_error": true, "request_cancelled": true, "request_timeout": true, "node_disconnected": true, "node_revoked": true, "key_revoked": true, "response_too_large": true, "backpressure": true, "protocol_error": true, "model_unavailable": true, "node_busy": true, "local_limit_reached": true, "consumer_disconnected": true, "invalid_node_response": true, "node_flow_control_exceeded": true, "slow_consumer": true, "node_error": true, "node_unavailable": true, "invalid_request": true, "control_plane_unavailable": true}
	if !allowed[code] {
		code = "upstream_error"
	}
	var oldConnection string
	err = tx.QueryRow("SELECT connection_id FROM relay_requests WHERE id=?", requestID).Scan(&oldConnection)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = tx.Exec("INSERT OR IGNORE INTO relay_cancelled_admissions(id,connection_id,expires_at) VALUES(?,?,?)", requestID, connection, now.Add(requestTimeout+5*time.Second).UnixMilli())
		return relay.ControlReply{OK: true}, err
	}
	if err != nil {
		return relay.ControlReply{}, err
	}
	if oldConnection != connection {
		return relay.ControlReply{}, relay.NewControlError(409, "request_conflict")
	}
	var responseStatus any
	if status != 0 {
		responseStatus = status
	}
	var errorCode any
	if code != "" {
		errorCode = code
	}
	_, err = tx.Exec("UPDATE relay_requests SET state=?,finished_at=?,response_status=?,response_bytes=?,error_code=? WHERE id=? AND connection_id=? AND state='running'", state, now.UnixMilli(), responseStatus, bytes, errorCode, requestID, connection)
	return relay.ControlReply{OK: true}, err
}

func catalogUsage(tx *sql.Tx, now time.Time) (relay.ControlReply, error) {
	end := now.UnixMilli() / 60_000 * 60_000
	start := end - 7*86_400_000
	rows, err := tx.Query("SELECT model_id,bucket_start,requests FROM model_usage_minutes WHERE bucket_start>=? AND bucket_start<? ORDER BY model_id,bucket_start", start, end)
	if err != nil {
		return relay.ControlReply{}, err
	}
	defer rows.Close()
	type totals struct {
		daily      map[string]int64
		day7, day1 int64
	}
	byModel := map[string]*totals{}
	for rows.Next() {
		var model string
		var bucket, count int64
		if err = rows.Scan(&model, &bucket, &count); err != nil {
			return relay.ControlReply{}, err
		}
		t := byModel[model]
		if t == nil {
			t = &totals{daily: map[string]int64{}}
			byModel[model] = t
		}
		date := time.UnixMilli(bucket).UTC().Format(time.DateOnly)
		t.daily[date] += count
		t.day7 += count
		if bucket >= end-86_400_000 {
			t.day1 += count
		}
	}
	ids := make([]string, 0, len(byModel))
	for id := range byModel {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	models := make([]relay.CatalogUsage, 0, len(ids))
	for _, id := range ids {
		t := byModel[id]
		activity := make([]relay.CatalogActivity, 7)
		for i := range activity {
			date := time.UnixMilli(end).UTC().AddDate(0, 0, i-6).Format(time.DateOnly)
			activity[i] = relay.CatalogActivity{Date: date, Requests: t.daily[date]}
		}
		models = append(models, relay.CatalogUsage{ID: id, Requests24h: t.day1, Requests7d: t.day7, Activity: activity})
	}
	var history int64
	if err = tx.QueryRow("SELECT history_since FROM model_usage_coverage WHERE id=1").Scan(&history); err != nil {
		return relay.ControlReply{}, fmt.Errorf("coverage: %w", err)
	}
	return relay.ControlReply{OK: true, UsageUpdatedAt: time.UnixMilli(end).UTC().Format(time.RFC3339Nano), HistorySince: time.UnixMilli(history).UTC().Format(time.RFC3339Nano), CatalogModels: models}, rows.Err()
}

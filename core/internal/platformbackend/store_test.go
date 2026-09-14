package platformbackend

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestInProcessControllerConnectsSyncsAndAdmits(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "platform.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := time.Date(2026, 9, 14, 8, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }
	consumerKey := "clv_live_" + strings.Repeat("a", 43)
	nodeKey := "clv_node_" + strings.Repeat("b", 43)
	stamp := now.Format(time.RFC3339Nano)
	if _, err = store.db.Exec("INSERT INTO users(id,email,created_at,last_login_at) VALUES('user-one','one@example.com',?,?)", stamp, stamp); err != nil {
		t.Fatal(err)
	}
	if _, err = store.db.Exec("INSERT INTO api_keys(id,user_id,name,key_prefix,key_hash,created_at) VALUES('key-one','user-one','test','clv_live_…',?,?)", hash(consumerKey), stamp); err != nil {
		t.Fatal(err)
	}
	if _, err = store.db.Exec(`INSERT INTO nodes(id,user_id,name,model,daily_budget,reserve_percent,schedule,usage_day,created_at,node_key_hash,node_key_revoked) VALUES('node-one','user-one','test','chat',100,0,'anytime',?,?,?,0)`, day(now), stamp, hash(nodeKey)); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if reply, err := store.Apply(ctx, "connect", map[string]any{"nodeKey": nodeKey, "connectionId": "connection-one"}); err != nil || reply.NodeID != "node-one" {
		t.Fatalf("connect reply=%+v err=%v", reply, err)
	}
	if _, err = store.Apply(ctx, "sync", map[string]any{"nodeKey": nodeKey, "connectionId": "connection-one", "models": []string{"model-a"}, "paused": false, "remaining": int64(100)}); err != nil {
		t.Fatal(err)
	}
	reply, err := store.Apply(ctx, "reserve", map[string]any{"consumerKey": consumerKey, "nodeKey": nodeKey, "connectionId": "connection-one", "requestId": "request-one", "model": "model-a", "deadline": now.Add(time.Minute).UnixMilli()})
	if err != nil || reply.Used != 1 {
		t.Fatalf("reserve reply=%+v err=%v", reply, err)
	}
	if _, err = store.Apply(ctx, "complete", map[string]any{"requestId": "request-one", "connectionId": "connection-one", "state": "completed", "status": int64(200), "bytes": int64(12), "errorCode": ""}); err != nil {
		t.Fatal(err)
	}
	var state string
	if err = store.db.QueryRow("SELECT state FROM relay_requests WHERE id='request-one'").Scan(&state); err != nil || state != "completed" {
		t.Fatalf("state=%q err=%v", state, err)
	}
}

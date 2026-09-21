PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE auth_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX auth_codes_email_created ON auth_codes(email, created_at DESC);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_token_expiry ON sessions(token_hash, expires_at);

CREATE TABLE account_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  free_balance INTEGER NOT NULL DEFAULT 0,
  credit_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX api_keys_user ON api_keys(user_id, created_at);
CREATE INDEX api_keys_hash_active ON api_keys(key_hash, revoked);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'chat',
  daily_budget INTEGER NOT NULL,
  reserve_percent INTEGER NOT NULL DEFAULT 0,
  schedule TEXT NOT NULL DEFAULT 'anytime',
  paused INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  usage_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model_id TEXT NOT NULL DEFAULT '',
  node_key_hash TEXT,
  node_key_prefix TEXT,
  node_key_revoked INTEGER NOT NULL DEFAULT 1,
  last_seen_at INTEGER,
  accepting INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  auth_version INTEGER NOT NULL DEFAULT 0,
  node_key_salt TEXT,
  relay_connection_id TEXT
);
CREATE UNIQUE INDEX nodes_key_hash ON nodes(node_key_hash);
CREATE UNIQUE INDEX nodes_user_device ON nodes(user_id, device_id) WHERE device_id IS NOT NULL;
CREATE INDEX nodes_user_created ON nodes(user_id, created_at);
CREATE INDEX nodes_dispatchable ON nodes(accepting, paused, node_key_revoked);

CREATE TABLE cli_connection_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  key_ciphertext TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  free_delta INTEGER NOT NULL,
  credit_delta INTEGER NOT NULL
);
CREATE INDEX credit_ledger_user_created ON credit_ledger(user_id, created_at DESC);

CREATE TABLE node_registration_rates (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  resets_at INTEGER NOT NULL
);

CREATE TABLE node_models (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  PRIMARY KEY (node_id, model_id)
);
CREATE INDEX node_models_model ON node_models(model_id, node_id);

CREATE TABLE relay_requests (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  model TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  finished_at INTEGER,
  response_status INTEGER,
  response_bytes INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE INDEX relay_request_node ON relay_requests(node_id, state);
CREATE INDEX relay_request_user ON relay_requests(user_id, state);
CREATE INDEX relay_request_running_deadline ON relay_requests(deadline) WHERE state = 'running';

CREATE TABLE model_usage_minutes (
  model_id TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  requests INTEGER NOT NULL,
  PRIMARY KEY (model_id, bucket_start)
);

CREATE TABLE model_usage_coverage (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  history_since INTEGER NOT NULL
);
INSERT INTO model_usage_coverage(id, history_since)
VALUES (1, unixepoch('now') * 1000);

import type { Env } from "../env";
import { base64urlEncode, decryptCLIKey, encryptCLIKey, randomBytes, sha256 } from "../shared/crypto";
import { hasAllowedOrigin, json, methodNotAllowed, readObject } from "../shared/http";
import {
  MODEL_PATTERN,
  connectionKeyUsesOrigin,
  createConnectionKey,
  normalizeOrigin,
  safeInteger,
  safeName,
} from "../shared/validation";
import { currentUser } from "./auth";
import type {
  ActionResult,
  APIKeyView,
  ContributionNodeView,
  LedgerEntryView,
  PlatformState,
} from "./types";

const MAX_ITEMS = 8;

interface BalanceRow {
  free_balance: number;
  credit_balance: number;
}

interface APIKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  revoked: number;
  created_at: string;
}

interface NodeRow {
  id: string;
  name: string;
  model: ContributionNodeView["model"];
  daily_budget: number;
  reserve_percent: number;
  schedule: ContributionNodeView["schedule"];
  paused: number;
  used: number;
  usage_day: string;
  model_id: string;
  device_id: string | null;
  node_key_prefix: string | null;
  node_key_revoked: number;
  last_seen_at: number | null;
  accepting: number;
}

interface LedgerRow {
  id: string;
  created_at: string;
  kind: LedgerEntryView["kind"];
  source: LedgerEntryView["source"];
  free_delta: number;
  credit_delta: number;
}

interface CLIKeyRow {
  key_hash: string;
  key_prefix: string;
  key_ciphertext: string | null;
  created_at: string;
}

interface ReturningRow {
  auth_version?: number;
  paused?: number;
  daily_budget?: number;
}

export class PlatformActionError extends Error {
  constructor(readonly code: "account_changed" | "invalid_request" | "item_limit" | "not_found" | "unauthorized") {
    super(code);
  }
}

function fail(code: PlatformActionError["code"]): never {
  throw new PlatformActionError(code);
}

function day(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function actionString(action: Record<string, unknown>, key: string, maximum: number): string {
  const value = safeName(action[key], maximum);
  if (!value) fail("invalid_request");
  return value;
}

function actionInteger(action: Record<string, unknown>, key: string, minimum: number, maximum: number): number {
  const value = safeInteger(action[key], minimum, maximum);
  if (value === null) fail("invalid_request");
  return value;
}

function resultRow<T>(result: D1Result<T>): T | null {
  return result.results.length > 0 ? result.results[0] : null;
}

function schedule(context: ExecutionContext, promise: Promise<unknown>, description: string): void {
  context.waitUntil(promise.catch((error: unknown) => console.error(description, error)));
}

export function signalNode(env: Env, context: ExecutionContext, nodeId: string, signal: Record<string, unknown>): void {
  const id = env.NODE_SESSIONS.idFromName(nodeId);
  const stub = env.NODE_SESSIONS.get(id);
  schedule(
    context,
    stub.fetch("https://node.internal/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
    }),
    "NodeSession control notification failed",
  );
}

function signalRevokedConsumer(env: Env, context: ExecutionContext, userId: string, apiKeyId: string): void {
  const id = env.ACCOUNT_GATES.idFromName(userId);
  const stub = env.ACCOUNT_GATES.get(id);
  schedule(
    context,
    stub.fetch("https://account.internal/revoke-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKeyId }),
    }),
    "AccountGate revocation notification failed",
  );
}

export async function getPlatformState(env: Env, userId: string): Promise<PlatformState> {
  const now = new Date();
  const stamp = now.toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO account_balances(user_id,created_at) VALUES(?,?)",
  ).bind(userId, stamp).run();

  const balance = await env.DB.prepare(
    "SELECT free_balance,credit_balance FROM account_balances WHERE user_id = ?",
  ).bind(userId).first<BalanceRow>();
  if (!balance) throw new Error("account balance is missing");

  const keyRows = (await env.DB.prepare(
    "SELECT id,name,key_prefix,revoked,created_at FROM api_keys WHERE user_id = ? ORDER BY created_at",
  ).bind(userId).all<APIKeyRow>()).results;
  const keys: APIKeyView[] = keyRows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    revoked: Boolean(row.revoked),
    createdAt: row.created_at,
  }));

  const nodeRows = (await env.DB.prepare(
    `SELECT id,name,model,daily_budget,reserve_percent,schedule,paused,used,usage_day,
            model_id,device_id,node_key_prefix,node_key_revoked,last_seen_at,accepting
       FROM nodes WHERE user_id = ? ORDER BY created_at`,
  ).bind(userId).all<NodeRow>()).results;
  const modelRows = (await env.DB.prepare(
    `SELECT node_models.node_id, node_models.model_id
       FROM node_models JOIN nodes ON nodes.id = node_models.node_id
      WHERE nodes.user_id = ? ORDER BY node_models.model_id`,
  ).bind(userId).all<{ node_id: string; model_id: string }>()).results;
  const models = new Map<string, string[]>();
  for (const row of modelRows) {
    const values = models.get(row.node_id) ?? [];
    values.push(row.model_id);
    models.set(row.node_id, values);
  }
  const today = day(now);
  const nodes: ContributionNodeView[] = nodeRows.map((row) => ({
    id: row.id,
    name: row.name,
    model: row.model,
    budget: row.daily_budget,
    reserve: row.reserve_percent,
    schedule: row.schedule,
    paused: Boolean(row.paused),
    used: row.usage_day === today ? row.used : 0,
    day: today,
    modelId: row.model_id,
    models: models.get(row.id) ?? [],
    deviceId: row.device_id,
    keyPrefix: row.node_key_prefix,
    keyRevoked: Boolean(row.node_key_revoked),
    lastSeenAt: row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString(),
    online: !row.node_key_revoked && Boolean(row.accepting),
  }));

  const ledgerRows = (await env.DB.prepare(
    `SELECT id,created_at,kind,source,free_delta,credit_delta
       FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`,
  ).bind(userId).all<LedgerRow>()).results;
  const entries: LedgerEntryView[] = ledgerRows.map((row) => ({
    id: row.id,
    at: row.created_at,
    kind: row.kind,
    source: row.source,
    freeDelta: row.free_delta,
    creditDelta: row.credit_delta,
  }));

  const cliRow = await env.DB.prepare(
    "SELECT key_hash,key_prefix,key_ciphertext,created_at FROM cli_connection_keys WHERE user_id = ?",
  ).bind(userId).first<CLIKeyRow>();
  let cliKey: PlatformState["cliKey"] = null;
  if (cliRow) {
    let plain: string | null = null;
    if (env.AUTH_SECRET && cliRow.key_ciphertext) {
      plain = await decryptCLIKey(env.AUTH_SECRET, userId, cliRow.key_ciphertext, cliRow.key_hash);
      if (plain && !connectionKeyUsesOrigin(plain, env.PUBLIC_ORIGIN)) plain = null;
    }
    cliKey = { prefix: cliRow.key_prefix, createdAt: cliRow.created_at, key: plain };
  }

  return {
    version: 1,
    userId,
    free: balance.free_balance,
    credits: balance.credit_balance,
    cliKey,
    keys,
    nodes,
    entries,
  };
}

export async function applyPlatformAction(
  env: Env,
  context: ExecutionContext,
  userId: string,
  action: Record<string, unknown>,
): Promise<ActionResult> {
  const kind = action.action;
  if (typeof kind !== "string") fail("invalid_request");
  const now = new Date();
  const stamp = now.toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO account_balances(user_id,created_at) VALUES(?,?)",
  ).bind(userId, stamp).run();

  switch (kind) {
    case "ensure_cli_key":
    case "issue_cli_key":
    case "revoke_cli_key": {
      const expected = actionString(action, "expectedUserId", 80);
      if (expected !== userId) fail("account_changed");
      if (kind === "revoke_cli_key") {
        await env.DB.prepare("DELETE FROM cli_connection_keys WHERE user_id = ?").bind(userId).run();
        return {};
      }
      const origin = normalizeOrigin(env.PUBLIC_ORIGIN);
      if (!origin || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail("invalid_request");
      if (kind === "ensure_cli_key") {
        const existing = await env.DB.prepare(
          "SELECT key_hash,key_ciphertext FROM cli_connection_keys WHERE user_id = ?",
        ).bind(userId).first<{ key_hash: string; key_ciphertext: string | null }>();
        if (existing?.key_ciphertext) {
          const plain = await decryptCLIKey(env.AUTH_SECRET, userId, existing.key_ciphertext, existing.key_hash);
          if (plain && connectionKeyUsesOrigin(plain, origin)) return {};
        }
      }
      const created = createConnectionKey(origin);
      if (!created) fail("invalid_request");
      await env.DB.prepare(
        `INSERT INTO cli_connection_keys(user_id,key_hash,key_prefix,key_ciphertext,created_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET
           key_hash=excluded.key_hash,
           key_prefix=excluded.key_prefix,
           key_ciphertext=excluded.key_ciphertext,
           created_at=excluded.created_at`,
      ).bind(
        userId,
        await sha256(created),
        `clv_connect_…${created.slice(-8)}`,
        await encryptCLIKey(env.AUTH_SECRET, userId, created),
        stamp,
      ).run();
      return { createdCLIKey: created };
    }

    case "create_key": {
      const name = actionString(action, "name", 36);
      const created = `clv_live_${base64urlEncode(randomBytes(32))}`;
      const inserted = await env.DB.prepare(
        `INSERT INTO api_keys(id,user_id,name,key_prefix,key_hash,created_at)
         SELECT ?,?,?,?,?,?
          WHERE (SELECT COUNT(*) FROM api_keys WHERE user_id = ?) < ?`,
      ).bind(
        crypto.randomUUID(),
        userId,
        name,
        `${created.slice(0, 17)}…`,
        await sha256(created),
        stamp,
        userId,
        MAX_ITEMS,
      ).run();
      if (inserted.meta.changes !== 1) fail("item_limit");
      return { createdKey: created };
    }

    case "revoke_key": {
      const id = actionString(action, "id", 80);
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?").bind(id, userId),
        env.DB.prepare(
          `UPDATE relay_requests
              SET state='cancelled',error_code='key_revoked',finished_at=?
            WHERE api_key_id=? AND state='running'
              AND EXISTS (
                SELECT 1 FROM api_keys
                 WHERE api_keys.id = ? AND api_keys.user_id = ? AND api_keys.revoked = 1
              )`,
        ).bind(now.getTime(), id, id, userId),
      ]);
      if (results[0].meta.changes !== 1) fail("not_found");
      signalRevokedConsumer(env, context, userId, id);
      return {};
    }

    case "create_node": {
      const name = actionString(action, "name", 36);
      const modelId = actionString(action, "modelId", 160);
      if (!MODEL_PATTERN.test(modelId)) fail("invalid_request");
      const budget = actionInteger(action, "budget", 1, 100_000);
      const id = crypto.randomUUID();
      const nodeKey = `clv_node_${base64urlEncode(randomBytes(32))}`;
      const results = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO nodes(
             id,user_id,name,model,model_id,daily_budget,reserve_percent,schedule,
             usage_day,created_at,node_key_hash,node_key_prefix,node_key_revoked
           )
           SELECT ?,?,?,'chat',?,?,0,'anytime',?,?,?,?,0
            WHERE (SELECT COUNT(*) FROM nodes WHERE user_id = ?) < ?`,
        ).bind(
          id,
          userId,
          name,
          modelId,
          budget,
          day(now),
          stamp,
          await sha256(nodeKey),
          `${nodeKey.slice(0, 17)}…`,
          userId,
          MAX_ITEMS,
        ),
        env.DB.prepare(
          "INSERT INTO node_models(node_id,model_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM nodes WHERE id = ?)",
        ).bind(id, modelId, id),
      ]);
      if (results[0].meta.changes !== 1) fail("item_limit");
      return { createdNodeKey: { nodeId: id, key: nodeKey } };
    }

    case "update_node": {
      const id = actionString(action, "id", 80);
      const budget = actionInteger(action, "budget", 1, 100_000);
      const result = await env.DB.prepare(
        `UPDATE nodes SET
           daily_budget = ?,
           accepting = CASE WHEN usage_day = ? AND used >= ? THEN 0 ELSE accepting END
         WHERE id = ? AND user_id = ? RETURNING daily_budget`,
      ).bind(budget, day(now), budget, id, userId).all<ReturningRow>();
      const row = resultRow(result);
      if (!row) fail("not_found");
      signalNode(env, context, id, { dailyLimit: row.daily_budget });
      return {};
    }

    case "toggle_node": {
      const id = actionString(action, "id", 80);
      const result = await env.DB.prepare(
        `UPDATE nodes SET
           accepting = CASE paused WHEN 0 THEN 0 ELSE accepting END,
           paused = CASE paused WHEN 1 THEN 0 ELSE 1 END
         WHERE id = ? AND user_id = ? RETURNING paused`,
      ).bind(id, userId).all<ReturningRow>();
      const row = resultRow(result);
      if (!row) fail("not_found");
      signalNode(env, context, id, { paused: Boolean(row.paused) });
      return {};
    }

    case "issue_node_key":
    case "revoke_node_key": {
      const id = actionString(action, "id", 80);
      let nodeKey: string | null = null;
      let update: D1PreparedStatement;
      if (kind === "issue_node_key") {
        nodeKey = `clv_node_${base64urlEncode(randomBytes(32))}`;
        update = env.DB.prepare(
          `UPDATE nodes SET
             node_key_hash=?,node_key_prefix=?,node_key_revoked=0,accepting=0,
             last_seen_at=NULL,relay_connection_id=NULL,auth_version=auth_version+1
           WHERE id=? AND user_id=? RETURNING auth_version`,
        ).bind(await sha256(nodeKey), `${nodeKey.slice(0, 17)}…`, id, userId);
      } else {
        update = env.DB.prepare(
          `UPDATE nodes SET
             node_key_revoked=1,accepting=0,last_seen_at=NULL,
             relay_connection_id=NULL,auth_version=auth_version+1
           WHERE id=? AND user_id=? RETURNING auth_version`,
        ).bind(id, userId);
      }
      const results = await env.DB.batch([
        update,
        env.DB.prepare(
          `UPDATE relay_requests
              SET state='cancelled',error_code='node_revoked',finished_at=?
            WHERE node_id=? AND state='running'
              AND EXISTS (
                SELECT 1 FROM nodes
                 WHERE nodes.id = ? AND nodes.user_id = ?
              )`,
        ).bind(now.getTime(), id, id, userId),
      ]);
      const row = resultRow(results[0] as D1Result<ReturningRow>);
      if (!row) fail("not_found");
      signalNode(env, context, id, { disconnect: true, authVersion: row.auth_version });
      return nodeKey ? { createdNodeKey: { nodeId: id, key: nodeKey } } : {};
    }

    default:
      fail("invalid_request");
  }
}

export async function handlePlatform(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed(request, env, ["GET", "POST"]);
  }
  const user = await currentUser(request, env);
  if (!user) return json(request, env, 401, { ok: false, error: "unauthorized" });
  if (request.method === "GET") {
    return json(request, env, 200, { ok: true, state: await getPlatformState(env, user.id) });
  }
  if (!hasAllowedOrigin(request, env)) return json(request, env, 403, { ok: false, error: "unauthorized" });
  const action = await readObject(request, 8192);
  if (!action) return json(request, env, 400, { ok: false, error: "invalid_request" });
  try {
    const result = await applyPlatformAction(env, context, user.id, action);
    return json(request, env, 200, {
      ok: true,
      state: await getPlatformState(env, user.id),
      ...result,
    });
  } catch (error) {
    if (!(error instanceof PlatformActionError)) throw error;
    const status = error.code === "invalid_request" ? 400 : error.code === "unauthorized" ? 403 : 409;
    return json(request, env, status, { ok: false, error: error.code });
  }
}

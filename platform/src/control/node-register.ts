import type { Env } from "../env";
import { deriveNodeKey, hexEncode, randomBytes, sha256 } from "../shared/crypto";
import { bearerToken, json, methodNotAllowed, readObject } from "../shared/http";
import {
  CONNECTION_KEY_PATTERN,
  connectionKeyUsesOrigin,
  hasOnlyKeys,
  normalizeDeviceId,
  safeInteger,
  safeName,
} from "../shared/validation";
import { signalNode } from "./platform";

const MAX_ITEMS = 8;

interface ExistingNodeRow {
  id: string;
  daily_budget: number;
  auth_version: number;
  node_key_salt: string | null;
  node_key_hash: string | null;
  node_key_revoked: number;
}

async function registrationAllowed(env: Env, bucket: string, maximum: number, now: number): Promise<boolean> {
  const expires = now + 60_000;
  const result = await env.DB.prepare(
    `INSERT INTO node_registration_rates(bucket,count,resets_at) VALUES(?,1,?)
     ON CONFLICT(bucket) DO UPDATE SET
       count = CASE WHEN resets_at <= ? THEN 1 ELSE count + 1 END,
       resets_at = CASE WHEN resets_at <= ? THEN ? ELSE resets_at END
     RETURNING count`,
  ).bind(await sha256(bucket), expires, now, now, expires).first<{ count: number }>();
  return Boolean(result && result.count <= maximum);
}

async function connectionOwner(env: Env, key: string): Promise<string | null> {
  if (!CONNECTION_KEY_PATTERN.test(key) || !connectionKeyUsesOrigin(key, env.PUBLIC_ORIGIN)) return null;
  const row = await env.DB.prepare(
    "SELECT user_id FROM cli_connection_keys WHERE key_hash = ?",
  ).bind(await sha256(key)).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function handleNodeRegister(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(request, env, ["POST"]);
  const key = bearerToken(request);
  if (!key) return json(request, env, 401, { ok: false, error: "unauthorized" });
  const body = await readObject(request, 4096);
  if (!body || !hasOnlyKeys(body, ["deviceId", "name", "dailyLimit"])) {
    return json(request, env, 400, { ok: false, error: "invalid_request" });
  }
  const deviceId = normalizeDeviceId(body.deviceId);
  const name = safeName(body.name, 80);
  const dailyLimit = body.dailyLimit === undefined || body.dailyLimit === null
    ? 100
    : safeInteger(body.dailyLimit, 1, 100_000);
  if (!deviceId || !name || dailyLimit === null) {
    return json(request, env, 400, { ok: false, error: "invalid_request" });
  }

  const owner = await connectionOwner(env, key);
  if (!owner) return json(request, env, 401, { ok: false, error: "unauthorized" });
  const now = Date.now();
  if (
    !(await registrationAllowed(env, `account:${owner}`, 100, now)) ||
    !(await registrationAllowed(env, `device:${owner}:${deviceId}`, 30, now))
  ) {
    return json(request, env, 429, { ok: false, error: "rate_limited" });
  }

  let node = await env.DB.prepare(
    `SELECT id,daily_budget,auth_version,node_key_salt,node_key_hash,node_key_revoked
       FROM nodes WHERE user_id = ? AND device_id = ?`,
  ).bind(owner, deviceId).first<ExistingNodeRow>();
  if (!node) {
    const id = crypto.randomUUID();
    const salt = hexEncode(randomBytes(32));
    const stamp = new Date(now).toISOString();
    const inserted = await env.DB.prepare(
      `INSERT INTO nodes(
         id,user_id,device_id,name,model,daily_budget,reserve_percent,schedule,
         usage_day,created_at,node_key_salt
       )
       SELECT ?,?,?,?,'chat',?,0,'anytime',?,?,?
        WHERE (SELECT COUNT(*) FROM nodes WHERE user_id = ?) < ?`,
    ).bind(id, owner, deviceId, name, dailyLimit, stamp.slice(0, 10), stamp, salt, owner, MAX_ITEMS).run();
    if (inserted.meta.changes !== 1) {
      node = await env.DB.prepare(
        `SELECT id,daily_budget,auth_version,node_key_salt,node_key_hash,node_key_revoked
           FROM nodes WHERE user_id = ? AND device_id = ?`,
      ).bind(owner, deviceId).first<ExistingNodeRow>();
      if (!node) return json(request, env, 409, { ok: false, error: "item_limit" });
    } else {
      node = {
        id,
        daily_budget: dailyLimit,
        auth_version: 0,
        node_key_salt: salt,
        node_key_hash: null,
        node_key_revoked: 1,
      };
    }
  }

  let salt = node.node_key_salt;
  if (!salt) salt = hexEncode(randomBytes(32));
  let nodeKey = await deriveNodeKey(key, node.id, salt, node.auth_version);
  let keyHash = await sha256(nodeKey);
  const rekeyed = Boolean(node.node_key_revoked || node.node_key_hash !== keyHash);
  if (rekeyed) {
    const previousVersion = node.auth_version;
    const nextVersion = previousVersion + 1;
    // A fresh salt makes concurrent registrations produce distinct candidate
    // keys, so the optimistic generation check cannot mistake a competing
    // update for its own successful write.
    salt = hexEncode(randomBytes(32));
    nodeKey = await deriveNodeKey(key, node.id, salt, nextVersion);
    keyHash = await sha256(nodeKey);
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE nodes SET
           name=?,node_key_hash=?,node_key_prefix=?,node_key_salt=?,node_key_revoked=0,
           accepting=0,last_seen_at=NULL,relay_connection_id=NULL,model_id='',auth_version=?
         WHERE id=? AND auth_version=?`,
      ).bind(name, keyHash, `${nodeKey.slice(0, 17)}…`, salt, nextVersion, node.id, previousVersion),
      env.DB.prepare(
        `DELETE FROM node_models
          WHERE node_id = ?
            AND EXISTS (
              SELECT 1 FROM nodes
               WHERE id = ? AND auth_version = ? AND node_key_hash = ?
            )`,
      ).bind(node.id, node.id, nextVersion, keyHash),
      env.DB.prepare(
        `UPDATE relay_requests
            SET state='cancelled',error_code='node_reconnected',finished_at=?
          WHERE node_id=? AND state='running'
            AND EXISTS (
              SELECT 1 FROM nodes
               WHERE id = ? AND auth_version = ? AND node_key_hash = ?
            )`,
      ).bind(now, node.id, node.id, nextVersion, keyHash),
    ]);
    if (results[0].meta.changes !== 1) {
      throw new Error("node registration generation changed");
    }
    node.auth_version = nextVersion;
    signalNode(env, context, node.id, { disconnect: true, authVersion: nextVersion });
  } else {
    await env.DB.prepare("UPDATE nodes SET name = ? WHERE id = ?").bind(name, node.id).run();
  }

  return json(request, env, 200, {
    ok: true,
    nodeId: node.id,
    key: nodeKey,
    name,
    dailyLimit: node.daily_budget,
  });
}

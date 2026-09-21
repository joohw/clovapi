import type { Env } from "../env";
import { sha256 } from "../shared/crypto";
import { bearerToken } from "../shared/http";
import { CONSUMER_KEY_PATTERN, NODE_KEY_PATTERN } from "../shared/validation";

export interface ConsumerIdentity {
  key: string;
  keyId: string;
  userId: string;
}

export interface NodeIdentity {
  nodeId: string;
  userId: string;
  dailyLimit: number;
  used: number;
  usageDay: string;
  paused: boolean;
  authVersion: number;
}

interface ConsumerRow {
  id: string;
  user_id: string;
}

interface NodeRow {
  id: string;
  user_id: string;
  daily_budget: number;
  used: number;
  usage_day: string;
  paused: number;
  auth_version: number;
}

export async function authenticateConsumer(request: Request, env: Env): Promise<ConsumerIdentity | null> {
  const key = bearerToken(request);
  if (!key || key.length > 2048 || !CONSUMER_KEY_PATTERN.test(key)) return null;
  const row = await env.DB.prepare(
    "SELECT id,user_id FROM api_keys WHERE key_hash = ? AND revoked = 0",
  ).bind(await sha256(key)).first<ConsumerRow>();
  return row ? { key, keyId: row.id, userId: row.user_id } : null;
}

export async function authenticateNode(request: Request, env: Env): Promise<NodeIdentity | null> {
  const key = bearerToken(request);
  if (!key || key.length > 2048 || !NODE_KEY_PATTERN.test(key)) return null;
  const row = await env.DB.prepare(
    `SELECT id,user_id,daily_budget,used,usage_day,paused,auth_version
       FROM nodes
      WHERE node_key_hash = ? AND node_key_revoked = 0`,
  ).bind(await sha256(key)).first<NodeRow>();
  return row ? {
    nodeId: row.id,
    userId: row.user_id,
    dailyLimit: row.daily_budget,
    used: row.used,
    usageDay: row.usage_day,
    paused: row.paused !== 0,
    authVersion: row.auth_version,
  } : null;
}

export function recordConsumerUse(env: Env, context: ExecutionContext, keyId: string): void {
  context.waitUntil(
    env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), keyId)
      .run()
      .then(() => undefined),
  );
}

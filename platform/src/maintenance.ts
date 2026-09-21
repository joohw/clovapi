import type { Env } from "./env";

const DAY_MS = 24 * 60 * 60_000;

export async function cleanupExpiredState(env: Env, now = Date.now()): Promise<void> {
  const stamp = new Date(now).toISOString();
  const authCutoff = new Date(now - DAY_MS).toISOString();
  const relayCutoff = now - 7 * DAY_MS;
  const usageCutoff = now - 8 * DAY_MS;

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM auth_codes
        WHERE expires_at <= ? AND (consumed_at IS NULL OR consumed_at <= ?)`,
    ).bind(stamp, authCutoff),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(stamp),
    env.DB.prepare("DELETE FROM node_registration_rates WHERE resets_at <= ?").bind(now),
    env.DB.prepare(
      `UPDATE relay_requests
          SET state = 'failed', finished_at = ?, response_status = 504, error_code = 'request_timeout'
        WHERE state = 'running' AND deadline <= ?`,
    ).bind(now, now),
    env.DB.prepare(
      `DELETE FROM relay_requests
        WHERE state <> 'running' AND finished_at IS NOT NULL AND finished_at < ?`,
    ).bind(relayCutoff),
    env.DB.prepare("DELETE FROM model_usage_minutes WHERE bucket_start < ?").bind(usageCutoff),
  ]);
}

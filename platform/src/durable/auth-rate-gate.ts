import { DurableObject } from "cloudflare:workers";

import type { Env } from "../env";
import {
  AUTH_RATE_POLICIES,
  evaluateAuthRate,
  isAuthRateKind,
} from "../control/auth-rate-policy";
import { isRecord } from "../shared/validation";

interface TimestampRow extends Record<string, SqlStorageValue> {
  created_at: number;
}

interface MinimumTimestampRow extends Record<string, SqlStorageValue> {
  earliest: number | null;
}

const CLAIM_RETENTION_MS = 60 * 60_000;

function response(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export class AuthRateGate extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS claims_created_at ON claims(created_at);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") return response(405, { ok: false, error: "method_not_allowed" });
    if (url.pathname !== "/claim") return response(404, { ok: false, error: "not_found" });

    let value: unknown;
    try {
      value = await request.json();
    } catch {
      return response(400, { ok: false, error: "invalid_request" });
    }
    if (!isRecord(value) || !isAuthRateKind(value.kind)) {
      return response(400, { ok: false, error: "invalid_request" });
    }

    // Everything after body parsing is synchronous SQLite work. A Durable
    // Object cannot interleave another claim inside this read/check/write.
    const now = Date.now();
    const policy = AUTH_RATE_POLICIES[value.kind];
    this.ctx.storage.sql.exec("DELETE FROM claims WHERE created_at <= ?", now - CLAIM_RETENTION_MS);
    const timestamps = this.ctx.storage.sql
      .exec<TimestampRow>("SELECT created_at FROM claims WHERE created_at > ? ORDER BY created_at", now - CLAIM_RETENTION_MS)
      .toArray()
      .map((row) => row.created_at);
    const decision = evaluateAuthRate(timestamps, now, policy);
    if (!decision.allowed) {
      return response(429, {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil(decision.retryAfterMs / 1000)),
      });
    }

    this.ctx.storage.sql.exec("INSERT INTO claims(created_at) VALUES(?)", now);
    await this.scheduleCleanup(now);
    return response(200, { ok: true });
  }

  async alarm(): Promise<void> {
    await this.scheduleCleanup(Date.now());
  }

  private async scheduleCleanup(now: number): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM claims WHERE created_at <= ?", now - CLAIM_RETENTION_MS);
    const row = this.ctx.storage.sql
      .exec<MinimumTimestampRow>("SELECT MIN(created_at) AS earliest FROM claims")
      .one();
    if (row.earliest === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(now + 1_000, row.earliest + CLAIM_RETENTION_MS));
  }
}

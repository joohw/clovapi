import type { Env } from "../env";
import { ACCOUNT_CONCURRENCY, REQUEST_TIMEOUT_MS } from "../relay/protocol";
import { isRecord } from "../shared/validation";

interface Admission {
  requestId: string;
  keyId: string;
  deadline: number;
  nodeId?: string;
}

const REQUEST_PREFIX = "request:";
const REVOKED_PREFIX = "revoked:";
const REVOKED_RETENTION_MS = 24 * 60 * 60_000;

function response(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function objectBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export class AccountGate implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly admissions = new Map<string, Admission>();
  private readonly revoked = new Map<string, number>();
  private readonly ready: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [requests, revoked] = await Promise.all([
        state.storage.list<Admission>({ prefix: REQUEST_PREFIX }),
        state.storage.list<number>({ prefix: REVOKED_PREFIX }),
      ]);
      for (const [key, admission] of requests) this.admissions.set(key.slice(REQUEST_PREFIX.length), admission);
      for (const [key, expiresAt] of revoked) this.revoked.set(key.slice(REVOKED_PREFIX.length), expiresAt);
      await this.cleanup(Date.now());
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (request.method !== "POST") return response(405, { ok: false, error: "method_not_allowed" });
    const path = new URL(request.url).pathname;
    const body = await objectBody(request);
    if (!body) return response(400, { ok: false, error: "invalid_request" });

    switch (path) {
      case "/acquire":
        return this.acquire(body);
      case "/bind":
        return this.bind(body);
      case "/release":
        return this.release(body);
      case "/revoke-key":
        return this.revokeKey(body);
      default:
        return response(404, { ok: false, error: "not_found" });
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.cleanup(Date.now());
  }

  private async acquire(body: Record<string, unknown>): Promise<Response> {
    const { requestId, keyId, deadline } = body;
    const now = Date.now();
    if (typeof requestId !== "string" || requestId.length > 80
      || typeof keyId !== "string" || keyId.length > 80
      || typeof deadline !== "number" || !Number.isSafeInteger(deadline)
      || deadline <= now || deadline > now + REQUEST_TIMEOUT_MS + 10_000) {
      return response(400, { ok: false, error: "invalid_request" });
    }
    await this.cleanup(now);
    if ((this.revoked.get(keyId) ?? 0) > now) return response(401, { ok: false, error: "key_revoked" });
    const existing = this.admissions.get(requestId);
    if (existing) {
      return existing.keyId === keyId
        ? response(200, { ok: true })
        : response(409, { ok: false, error: "request_conflict" });
    }
    if (this.admissions.size >= ACCOUNT_CONCURRENCY) {
      return response(429, { ok: false, error: "account_concurrency_exceeded" });
    }
    const admission: Admission = { requestId, keyId, deadline };
    this.admissions.set(requestId, admission);
    await this.state.storage.put(REQUEST_PREFIX + requestId, admission);
    await this.scheduleAlarm(now);
    return response(200, { ok: true });
  }

  private async bind(body: Record<string, unknown>): Promise<Response> {
    const { requestId, nodeId } = body;
    if (typeof requestId !== "string" || typeof nodeId !== "string" || requestId.length > 80 || nodeId.length > 80) {
      return response(400, { ok: false, error: "invalid_request" });
    }
    const admission = this.admissions.get(requestId);
    if (!admission) return response(404, { ok: false, error: "admission_not_found" });
    if (admission.nodeId && admission.nodeId !== nodeId) return response(409, { ok: false, error: "request_conflict" });
    admission.nodeId = nodeId;
    await this.state.storage.put(REQUEST_PREFIX + requestId, admission);
    return response(200, { ok: true });
  }

  private async release(body: Record<string, unknown>): Promise<Response> {
    const { requestId } = body;
    if (typeof requestId !== "string" || requestId.length > 80) return response(400, { ok: false, error: "invalid_request" });
    this.admissions.delete(requestId);
    await this.state.storage.delete(REQUEST_PREFIX + requestId);
    await this.scheduleAlarm(Date.now());
    return response(200, { ok: true });
  }

  private async revokeKey(body: Record<string, unknown>): Promise<Response> {
    const keyId = typeof body.apiKeyId === "string" ? body.apiKeyId : body.keyId;
    if (typeof keyId !== "string" || keyId.length > 80) return response(400, { ok: false, error: "invalid_request" });
    const expiresAt = Date.now() + REVOKED_RETENTION_MS;
    this.revoked.set(keyId, expiresAt);
    await this.state.storage.put(REVOKED_PREFIX + keyId, expiresAt);
    const targets = [...this.admissions.values()].filter((admission) => admission.keyId === keyId);
    await Promise.all(targets.map(async (admission) => {
      this.admissions.delete(admission.requestId);
      await this.state.storage.delete(REQUEST_PREFIX + admission.requestId);
      this.cancelBound(admission, "request_cancelled");
    }));
    await this.scheduleAlarm(Date.now());
    return response(200, { ok: true, cancelled: targets.length });
  }

  private async cleanup(now: number): Promise<void> {
    const expiredAdmissions = [...this.admissions.values()].filter((item) => item.deadline <= now);
    const expiredRevocations = [...this.revoked.entries()].filter(([, expiresAt]) => expiresAt <= now);
    await Promise.all([
      ...expiredAdmissions.map(async (admission) => {
        this.admissions.delete(admission.requestId);
        await this.state.storage.delete(REQUEST_PREFIX + admission.requestId);
        this.cancelBound(admission, "request_timeout");
      }),
      ...expiredRevocations.map(async ([keyId]) => {
        this.revoked.delete(keyId);
        await this.state.storage.delete(REVOKED_PREFIX + keyId);
      }),
    ]);
    await this.scheduleAlarm(now);
  }

  private cancelBound(admission: Admission, code: string): void {
    if (!admission.nodeId) return;
    const stub = this.env.NODE_SESSIONS.get(this.env.NODE_SESSIONS.idFromName(admission.nodeId));
    this.state.waitUntil(stub.fetch("https://node-session.internal/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", requestId: admission.requestId, code }),
    }).then(() => undefined).catch(() => undefined));
  }

  private async scheduleAlarm(now: number): Promise<void> {
    const deadlines = [
      ...[...this.admissions.values()].map((item) => item.deadline),
      ...this.revoked.values(),
    ];
    if (deadlines.length === 0) {
      await this.state.storage.deleteAlarm();
      return;
    }
    await this.state.storage.setAlarm(Math.max(now + 1_000, Math.min(...deadlines)));
  }
}

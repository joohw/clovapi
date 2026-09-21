import type { Env } from "../env";

interface GateReply {
  ok: boolean;
  error?: string;
}

function stubFor(env: Env, userId: string): DurableObjectStub {
  return env.ACCOUNT_GATES.get(env.ACCOUNT_GATES.idFromName(userId));
}

async function post(env: Env, userId: string, path: string, body: unknown): Promise<Response> {
  return stubFor(env, userId).fetch(`https://account-gate.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function acquireAccountSlot(
  env: Env,
  userId: string,
  keyId: string,
  requestId: string,
  deadline: number,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const response = await post(env, userId, "/acquire", { keyId, requestId, deadline });
  if (response.ok) return { ok: true };
  let value: GateReply | null = null;
  try {
    value = await response.json<GateReply>();
  } catch {
    // An unavailable gate is a closed admission path, never an excuse to exceed
    // the account-wide concurrency limit.
  }
  return {
    ok: false,
    code: value?.error ?? "account_gate_unavailable",
    status: response.status >= 400 && response.status <= 599 ? response.status : 503,
  };
}

export async function bindAccountSlot(env: Env, userId: string, requestId: string, nodeId: string): Promise<boolean> {
  try {
    const response = await post(env, userId, "/bind", { requestId, nodeId });
    return response.ok;
  } catch {
    return false;
  }
}

export async function releaseAccountSlot(env: Env, userId: string, requestId: string): Promise<void> {
  await post(env, userId, "/release", { requestId }).catch(() => undefined);
}

export async function revokeAccountKey(env: Env, userId: string, keyId: string): Promise<void> {
  const response = await post(env, userId, "/revoke-key", { keyId });
  if (!response.ok) throw new Error(`account gate rejected key revocation: ${response.status}`);
}

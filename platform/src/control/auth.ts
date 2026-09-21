import type { Env } from "../env";
import { base64urlEncode, hmacHex, randomBytes, sha256 } from "../shared/crypto";
import {
  cookieValue,
  expiredSessionCookie,
  hasAllowedOrigin,
  json,
  methodNotAllowed,
  readObject,
  sessionCookie,
} from "../shared/http";
import { hasOnlyKeys, normalizeEmail } from "../shared/validation";

const SESSION_COOKIE = "clovapi_session";
const CODE_PATTERN = /^\d{6}$/u;

interface AuthCodeRow {
  id: string;
  code_hash: string;
  attempts: number;
}

interface UserRow {
  id: string;
  email: string;
}

interface RateClaimResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

type AuthRateEnv = Env & Required<Pick<Env, "AUTH_SECRET">>;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

function secureCookies(env: Env): boolean {
  return env.COOKIE_SECURE?.toLowerCase() !== "false";
}

function validMailConfiguration(env: Env): env is Env & Required<Pick<Env, "AUTH_SECRET" | "RESEND_API_KEY" | "RESEND_FROM">> {
  return Boolean(env.AUTH_SECRET && env.AUTH_SECRET.length >= 32 && env.RESEND_API_KEY && env.RESEND_FROM);
}

function randomCode(): string {
  const bytes = randomBytes(4);
  const number = (((bytes[0] << 24) >>> 0) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(number % 1_000_000).padStart(6, "0");
}

async function claimRateGate(env: Env, kind: "email" | "ip", subjectHash: string): Promise<RateClaimResult> {
  const stub = env.AUTH_RATE_GATES.get(env.AUTH_RATE_GATES.idFromName(`${kind}:${subjectHash}`));
  const response = await stub.fetch("https://auth-rate.internal/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("auth rate gate returned an invalid response");
  }
  if (response.ok) return { allowed: true, retryAfterSeconds: 0 };
  if (
    response.status === 429
    && typeof body === "object"
    && body !== null
    && "retryAfterSeconds" in body
    && typeof body.retryAfterSeconds === "number"
    && Number.isSafeInteger(body.retryAfterSeconds)
    && body.retryAfterSeconds > 0
  ) {
    return { allowed: false, retryAfterSeconds: body.retryAfterSeconds };
  }
  throw new Error("auth rate gate failed");
}

async function claimAuthCodeRate(request: Request, env: AuthRateEnv, email: string): Promise<RateClaimResult> {
  const sourceIp = request.headers.get("CF-Connecting-IP")?.trim().toLowerCase() || "unavailable";
  const [emailHash, ipHash] = await Promise.all([
    hmacHex(env.AUTH_SECRET, `auth-rate:email:${email}`),
    hmacHex(env.AUTH_SECRET, `auth-rate:ip:${sourceIp}`),
  ]);
  const claims = await Promise.all([
    claimRateGate(env, "email", emailHash),
    claimRateGate(env, "ip", ipHash),
  ]);
  const denied = claims.filter((claim) => !claim.allowed);
  return denied.length === 0
    ? { allowed: true, retryAfterSeconds: 0 }
    : { allowed: false, retryAfterSeconds: Math.max(...denied.map((claim) => claim.retryAfterSeconds)) };
}

async function sendCode(env: Env & Required<Pick<Env, "RESEND_API_KEY" | "RESEND_FROM">>, id: string, email: string, code: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `clovapi-login-${id}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [email],
        subject: "你的 clovapi 登录验证码",
        text: `你的 clovapi 登录验证码是 ${code}。验证码 10 分钟内有效，请勿转发。`,
        html: `<div style="font-family:Arial,sans-serif;color:#272420"><h2>登录 clovapi</h2><p>你的验证码是：</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p></div>`,
      }),
    });
    if (response.status === 401) return "mail_auth_failed";
    if (response.status === 403) return "mail_domain_unverified";
    return response.ok ? null : "mail_unavailable";
  } catch {
    return "mail_unavailable";
  }
}

export async function currentUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT sessions.user_id AS id, users.email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  ).bind(await sha256(token), new Date().toISOString()).first<UserRow>();
  return row ? { id: row.id, email: row.email } : null;
}

export async function handleAuthCode(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(request, env, ["POST"]);
  if (!hasAllowedOrigin(request, env)) return json(request, env, 403, { ok: false, error: "unauthorized" });
  const body = await readObject(request, 4096);
  const email = body && hasOnlyKeys(body, ["email"]) ? normalizeEmail(body.email) : null;
  if (!email) return json(request, env, 400, { ok: false, error: "invalid_email" });
  if (!validMailConfiguration(env)) return json(request, env, 503, { ok: false, error: "mail_unavailable" });

  const now = new Date();
  const rate = await claimAuthCodeRate(request, env, email);
  if (!rate.allowed) {
    return json(
      request,
      env,
      429,
      { ok: false, error: "rate_limited" },
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  const code = randomCode();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO auth_codes(id,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
  ).bind(
    id,
    email,
    await hmacHex(env.AUTH_SECRET, `${email}:${code}`),
    new Date(now.getTime() + 10 * 60_000).toISOString(),
    now.toISOString(),
  ).run();
  const error = await sendCode(env, id, email, code);
  if (error) {
    await env.DB.prepare("DELETE FROM auth_codes WHERE id = ?").bind(id).run();
    return json(request, env, 503, { ok: false, error });
  }
  return json(request, env, 200, { ok: true, email });
}

export async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(request, env, ["POST"]);
  if (!hasAllowedOrigin(request, env)) return json(request, env, 403, { ok: false, error: "unauthorized" });
  const body = await readObject(request, 4096);
  const email = body && hasOnlyKeys(body, ["email", "code"]) ? normalizeEmail(body.email) : null;
  const code = body?.code;
  if (!email || typeof code !== "string" || !CODE_PATTERN.test(code) || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    return json(request, env, 400, { ok: false, error: "invalid_code" });
  }

  const now = new Date();
  const stamp = now.toISOString();
  const latest = await env.DB.prepare(
    `SELECT id, code_hash, attempts
       FROM auth_codes
      WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(email, stamp).first<AuthCodeRow>();
  if (!latest) return json(request, env, 400, { ok: false, error: "code_expired" });
  if (latest.attempts >= 5) return json(request, env, 400, { ok: false, error: "invalid_code" });

  const claimed = await env.DB.prepare(
    `UPDATE auth_codes
        SET attempts = attempts + 1
      WHERE id = ? AND consumed_at IS NULL AND attempts < 5 AND expires_at > ?`,
  ).bind(latest.id, stamp).run();
  if (claimed.meta.changes !== 1) return json(request, env, 400, { ok: false, error: "invalid_code" });

  const actual = await hmacHex(env.AUTH_SECRET, `${email}:${code}`);
  if (actual !== latest.code_hash) return json(request, env, 400, { ok: false, error: "invalid_code" });

  const consumed = await env.DB.prepare(
    "UPDATE auth_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
  ).bind(stamp, latest.id).run();
  if (consumed.meta.changes !== 1) return json(request, env, 400, { ok: false, error: "invalid_code" });

  const candidateId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users(id,email,created_at,last_login_at) VALUES(?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at`,
  ).bind(candidateId, email, stamp, stamp).run();
  const user = await env.DB.prepare("SELECT id,email FROM users WHERE email = ?").bind(email).first<UserRow>();
  if (!user) throw new Error("user insert did not return a row");

  const token = base64urlEncode(randomBytes(32));
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  await env.DB.batch([
    env.DB.prepare("UPDATE auth_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL").bind(stamp, email),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? OR expires_at <= ?").bind(user.id, stamp),
    env.DB.prepare(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), user.id, await sha256(token), expires.toISOString(), stamp, stamp),
  ]);

  return json(
    request,
    env,
    200,
    { ok: true, user: { id: user.id, email: user.email } },
    { "Set-Cookie": sessionCookie(token, expires, secureCookies(env)) },
  );
}

export async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(request, env, ["GET"]);
  const user = await currentUser(request, env);
  return user
    ? json(request, env, 200, { ok: true, user })
    : json(request, env, 401, { ok: false });
}

export async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(request, env, ["POST"]);
  if (!hasAllowedOrigin(request, env)) return json(request, env, 403, { ok: false });
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json(
    request,
    env,
    200,
    { ok: true },
    { "Set-Cookie": expiredSessionCookie(secureCookies(env)) },
  );
}

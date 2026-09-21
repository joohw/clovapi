import type { Env } from "../env";
import { isRecord } from "./validation";

export type BoundedUtf8BodyResult =
  | { ok: true; text: string }
  | { ok: false; error: "invalid_body" | "body_too_large" };

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel("request body exceeds the configured limit");
  } catch {
    // The stream may already be errored or closed. The request is rejected either way.
  }
}

export async function readBoundedUtf8Body(
  request: Request,
  maximumBytes: number,
): Promise<BoundedUtf8BodyResult> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) return { ok: false, error: "invalid_body" };
    if (Number(contentLength) > maximumBytes) return { ok: false, error: "body_too_large" };
  }

  if (request.body === null) return { ok: true, text: "" };

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { ok: false, error: "invalid_body" };
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maximumBytes - size) {
        await cancelReader(reader);
        return { ok: false, error: "body_too_large" };
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    await cancelReader(reader);
    return { ok: false, error: "invalid_body" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    };
  } catch {
    return { ok: false, error: "invalid_body" };
  }
}

export function allowedOrigin(request: Request, env: Env): string | null {
  const raw = request.headers.get("Origin");
  if (!raw) return null;
  const origin = raw.replace(/\/$/u, "");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim().replace(/\/$/u, "")).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

export function hasAllowedOrigin(request: Request, env: Env): boolean {
  return allowedOrigin(request, env) !== null;
}

function baseHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.append("Vary", "Origin");
  }
  return headers;
}

export function json(request: Request, env: Env, status: number, value: unknown, extra?: HeadersInit): Response {
  const headers = baseHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (extra) new Headers(extra).forEach((headerValue, name) => headers.set(name, headerValue));
  return new Response(JSON.stringify(value), { status, headers });
}

export function empty(request: Request, env: Env, status: number, extra?: HeadersInit): Response {
  const headers = baseHeaders(request, env);
  if (extra) new Headers(extra).forEach((headerValue, name) => headers.set(name, headerValue));
  return new Response(null, { status, headers });
}

export function methodNotAllowed(request: Request, env: Env, methods: string[]): Response {
  return json(request, env, 405, { ok: false, error: "method_not_allowed" }, { Allow: methods.join(", ") });
}

export function preflight(request: Request, env: Env): Response {
  if (!hasAllowedOrigin(request, env)) return json(request, env, 403, { ok: false, error: "forbidden" });
  return empty(request, env, 204, {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  });
}

export async function readObject(request: Request, maximumBytes: number): Promise<Record<string, unknown> | null> {
  const result = await readBoundedUtf8Body(request, maximumBytes);
  if (!result.ok) return null;
  try {
    const value: unknown = JSON.parse(result.text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionCookie(token: string, expires: Date, secure: boolean): string {
  const fields = [
    `clovapi_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
  ];
  if (secure) fields.push("Secure");
  return fields.join("; ");
}

export function expiredSessionCookie(secure: boolean): string {
  const fields = [
    "clovapi_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (secure) fields.push("Secure");
  return fields.join("; ");
}

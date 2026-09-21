import { readBoundedUtf8Body } from "../shared/http";
import { MODEL_PATTERN, isRecord } from "../shared/validation";

export const RELAY_PROTOCOL = 1;
export const NODE_CONCURRENCY = 5;
export const ACCOUNT_CONCURRENCY = 20;
export const INITIAL_WINDOW_BYTES = 256 * 1024;
export const MAX_CHUNK_BYTES = 32 * 1024;
export const MAX_INFLIGHT_FRAMES = 32;
export const MAX_REQUEST_BYTES = 512 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 120_000;

export interface RelayWireMessage {
  type: string;
  protocol?: number;
  nodeId?: string;
  id?: string;
  seq?: number;
  models?: string[];
  paused?: boolean;
  remaining?: number;
  concurrency?: number;
  dailyLimit?: number;
  used?: number;
  path?: string;
  body?: Record<string, unknown>;
  deadline?: string;
  status?: number;
  contentType?: string;
  data?: string;
  code?: string;
  bytes?: number;
}

export interface RelayRequestBody {
  model: string;
  stream?: boolean;
  [key: string]: unknown;
}

export interface RelayRequestValidation {
  raw: string;
  body: RelayRequestBody;
}

export function relayError(code: string, status = 502, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify({
    error: {
      type: "relay_error",
      code,
      message: code.replaceAll("_", " "),
    },
  }), { status, headers });
}

export function admissionRejected(code: string): Response {
  return relayError(code, 409, { "X-Clovapi-Relay-Admission": "rejected" });
}

export function isAdmissionRejected(response: Response): boolean {
  return response.headers.get("X-Clovapi-Relay-Admission") === "rejected";
}

export function parseRelayWireMessage(value: string | ArrayBuffer): RelayWireMessage | null {
  if (typeof value !== "string") return null;
  if (new TextEncoder().encode(value).byteLength > 64 * 1024) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) && typeof parsed.type === "string"
      ? parsed as unknown as RelayWireMessage
      : null;
  } catch {
    return null;
  }
}

export function validModelList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 256) return false;
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !MODEL_PATTERN.test(item) || unique.has(item)) return false;
    unique.add(item);
  }
  return true;
}

export function normalizeWireModels(value: unknown): string[] | null {
  if (value === undefined) return [];
  return validModelList(value) ? value : null;
}

export function validContentType(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\r\n]/u.test(value)) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json"
    || mediaType === "text/event-stream"
    || mediaType === "text/plain"
    || mediaType === "application/octet-stream";
}

export function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 44_000 || value.length % 4 !== 0) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return null;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    let canonical = "";
    for (const byte of bytes) canonical += String.fromCharCode(byte);
    return btoa(canonical) === value ? bytes : null;
  } catch {
    return null;
  }
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function readRelayRequest(request: Request): Promise<RelayRequestValidation | Response> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return relayError("invalid_content_type", 400);
  const result = await readBoundedUtf8Body(request, MAX_REQUEST_BYTES);
  if (!result.ok) {
    return result.error === "body_too_large"
      ? relayError("request_too_large", 413)
      : relayError("invalid_request", 400);
  }
  const raw = result.text;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.model !== "string" || !MODEL_PATTERN.test(parsed.model)) {
      return relayError("invalid_request", 400);
    }
    if ("stream" in parsed && typeof parsed.stream !== "boolean") return relayError("invalid_request", 400);
    return { raw, body: parsed as RelayRequestBody };
  } catch {
    return relayError("invalid_request", 400);
  }
}

export function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export type AuthGenerationRelation = "invalid" | "older" | "current" | "newer";

export function compareAuthGeneration(current: number, signalled: unknown): AuthGenerationRelation {
  if (!isSafeNonNegativeInteger(signalled)) return "invalid";
  if (signalled < current) return "older";
  if (signalled === current) return "current";
  return "newer";
}

export function mergeUsageSnapshot(
  currentDay: string,
  currentUsed: number,
  observedDay: string,
  observedUsed: number,
  today: string,
): { usageDay: string; used: number } {
  if (currentDay === today) {
    return {
      usageDay: today,
      used: observedDay === today ? Math.max(currentUsed, observedUsed) : currentUsed,
    };
  }
  return observedDay === today
    ? { usageDay: today, used: observedUsed }
    : { usageDay: today, used: 0 };
}

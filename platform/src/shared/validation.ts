import { base64urlDecode, base64urlEncode, randomBytes, utf8, utf8Decode } from "./crypto";

export const CONNECTION_KEY_PATTERN = /^clv_connect_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/u;
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,159}$/u;
export const NODE_KEY_PATTERN = /^clv_node_[A-Za-z0-9_-]{43}$/u;
export const CONSUMER_KEY_PATTERN = /^clv_live_[A-Za-z0-9_-]{43}$/u;

export function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname.startsWith("127.");
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password) {
      return null;
    }
    if (url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function connectionKeyUsesOrigin(key: string, expectedOrigin: string): boolean {
  const match = CONNECTION_KEY_PATTERN.exec(key);
  if (!match || match[1].length > 2048) return false;
  const encoded = match[1];
  const bytes = base64urlDecode(encoded);
  if (!bytes || base64urlEncode(bytes) !== encoded) return false;
  const decoded = utf8Decode(bytes);
  return decoded !== null && normalizeOrigin(decoded) === normalizeOrigin(expectedOrigin);
}

export function createConnectionKey(publicOrigin: string): string | null {
  const origin = normalizeOrigin(publicOrigin);
  if (!origin) return null;
  return `clv_connect_${base64urlEncode(utf8(origin))}.${base64urlEncode(randomBytes(16))}`;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 254 || /[\s<>(),;:\\"\[\]]/u.test(value)) return null;
  const pieces = value.split("@");
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]?.includes(".")) return null;
  if (pieces[0].length > 64 || pieces[1].length > 253) return null;
  const labels = pieces[1].split(".");
  if (labels.some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))) return null;
  return value;
}

export function normalizeDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.toLowerCase();
  const candidate = value.startsWith("urn:uuid:") ? value.slice(9) : value.startsWith("{") && value.endsWith("}") ? value.slice(1, -1) : value;
  if (/^[0-9a-f]{32}$/u.test(candidate) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(candidate)) {
    return value;
  }
  return null;
}

export function safeName(raw: unknown, maximum: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > maximum || /[\0\r\n\t]/u.test(value)) return null;
  return value;
}

export function safeInteger(raw: unknown, minimum: number, maximum: number): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= minimum && raw <= maximum ? raw : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const names = new Set(allowed);
  return Object.keys(value).every((key) => names.has(key));
}

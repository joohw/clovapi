const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64urlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) return null;
  const padding = (4 - (value.length % 4)) % 4;
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(padding));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return base64urlEncode(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export function utf8Decode(value: Uint8Array): string | null {
  try {
    return decoder.decode(value);
  } catch {
    return null;
  }
}

export function hexEncode(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
  return hexEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(value))));
}

export async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(value)));
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  return hexEncode(await hmacSha256(secret, value));
}

async function cliEncryptionKey(authSecret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    utf8(`clovapi:cli-connection-key:v1\0${authSecret}`),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptCLIKey(authSecret: string, userId: string, plain: string): Promise<string> {
  const iv = randomBytes(12);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: utf8(userId), tagLength: 128 },
      await cliEncryptionKey(authSecret),
      utf8(plain),
    ),
  );
  const tag = encrypted.slice(encrypted.length - 16);
  const body = encrypted.slice(0, encrypted.length - 16);
  return `v1.${base64urlEncode(iv)}.${base64urlEncode(tag)}.${base64urlEncode(body)}`;
}

export async function decryptCLIKey(
  authSecret: string,
  userId: string,
  encrypted: string,
  expectedHash: string,
): Promise<string | null> {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const iv = base64urlDecode(parts[1]);
  const tag = base64urlDecode(parts[2]);
  const body = base64urlDecode(parts[3]);
  if (!iv || !tag || !body || tag.length !== 16) return null;
  const combined = new Uint8Array(body.length + tag.length);
  combined.set(body);
  combined.set(tag, body.length);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: utf8(userId), tagLength: 128 },
      await cliEncryptionKey(authSecret),
      combined,
    );
    const plain = utf8Decode(new Uint8Array(decrypted));
    return plain !== null && (await sha256(plain)) === expectedHash ? plain : null;
  } catch {
    return null;
  }
}

export async function deriveNodeKey(
  connectionKey: string,
  nodeId: string,
  salt: string,
  authVersion: number,
): Promise<string> {
  const digest = await hmacSha256(
    connectionKey,
    `clovapi:node:${nodeId}:${salt}:${authVersion}`,
  );
  return `clv_node_${base64urlEncode(digest)}`;
}

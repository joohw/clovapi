const zlib = require("node:zlib");

/** Headers to drop when relaying upstream HTTP responses to clients. */
const STRIP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "transfer-encoding",
  "content-encoding",
]);

function sanitizeUpstreamResponseHeaders(headers, extra = {}) {
  const out = { ...extra };
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = String(key || "").toLowerCase();
    if (!lower || STRIP_RESPONSE_HEADERS.has(lower)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function decompressResponseBody(buffer, contentEncoding) {
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!raw.length) return raw;
  const enc = String(contentEncoding || "").toLowerCase();
  if (enc.includes("gzip")) return zlib.gunzipSync(raw);
  if (enc.includes("deflate")) return zlib.inflateSync(raw);
  if (enc.includes("br")) return zlib.brotliDecompressSync(raw);
  return raw;
}

function createDecompressStream(contentEncoding) {
  const enc = String(contentEncoding || "").toLowerCase();
  if (enc.includes("gzip")) return zlib.createGunzip();
  if (enc.includes("deflate")) return zlib.createInflate();
  if (enc.includes("br")) return zlib.createBrotliDecompress();
  return null;
}

module.exports = {
  STRIP_RESPONSE_HEADERS,
  sanitizeUpstreamResponseHeaders,
  decompressResponseBody,
  createDecompressStream,
};

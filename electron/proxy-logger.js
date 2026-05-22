const MAX_ENTRIES = 200;

let nextId = 1;
const entries = [];

function nowIso() {
  return new Date().toISOString();
}

function cloneHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[key] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  return out;
}

function trimText(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
  return { text };
}

function pushEntry(entry) {
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

function startRequest(data) {
  const id = String(nextId++);
  const body = trimText(data?.requestBody || "");
  const entry = {
    id,
    startedAt: nowIso(),
    completedAt: "",
    durationMs: 0,
    request: {
      method: String(data?.method || ""),
      url: String(data?.url || ""),
      headers: cloneHeaders(data?.headers),
      body: body.text,
    },
    upstream: {
      method: String(data?.upstreamMethod || data?.method || ""),
      url: String(data?.upstreamUrl || ""),
      status: 0,
      headers: {},
      body: "",
    },
    error: "",
  };
  pushEntry(entry);
  return id;
}

function findEntry(id) {
  return entries.find((entry) => entry.id === String(id || ""));
}

function setUpstreamResponse(id, response) {
  const entry = findEntry(id);
  if (!entry) return;
  entry.upstream.status = Number(response?.status || 0);
  entry.upstream.headers = cloneHeaders(response?.headers);
}

function appendUpstreamBody(id, chunk) {
  const entry = findEntry(id);
  if (!entry) return;
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk ?? "");
  entry.upstream.body += text;
}

function finishRequest(id, error = "") {
  const entry = findEntry(id);
  if (!entry) return;
  entry.completedAt = nowIso();
  entry.durationMs = Math.max(0, Date.parse(entry.completedAt) - Date.parse(entry.startedAt));
  entry.error = String(error || "");
}

function list() {
  return entries.map((entry) => ({
    ...entry,
    request: { ...entry.request, headers: { ...entry.request.headers } },
    upstream: { ...entry.upstream, headers: { ...entry.upstream.headers } },
  }));
}

function clear() {
  entries.length = 0;
}

function pushProcLine(stream, redactedBody) {
  const id = String(nextId++);
  const body = Buffer.isBuffer(redactedBody) ? redactedBody.toString("utf8") : String(redactedBody ?? "");
  const stamp = stream === "stderr" ? "ERR" : "OUT";
  const entry = {
    id,
    startedAt: nowIso(),
    completedAt: nowIso(),
    durationMs: 0,
    request: {
      method: "CORE",
      url: `[go-proxy/${stamp}]`,
      headers: {},
      body,
    },
    upstream: {
      method: "",
      url: "",
      status: 0,
      headers: {},
      body: "",
    },
    error: "",
  };
  pushEntry(entry);
  return id;
}

function pushProcChunks(stream, redactedChunks) {
  const textSource = Buffer.isBuffer(redactedChunks)
    ? redactedChunks.toString("utf8")
    : String(redactedChunks ?? "");
  const normalized = textSource.endsWith("\n") ? textSource.slice(0, -1) : textSource;
  const lines = normalized.split(/\n/).filter((line) => line.length > 0);
  if (!lines.length) {
    pushProcLine(stream, textSource.trim() === "" ? "" : textSource);
    return;
  }
  for (const line of lines) {
    pushProcLine(stream, line);
  }
}

module.exports = {
  startRequest,
  setUpstreamResponse,
  appendUpstreamBody,
  finishRequest,
  list,
  clear,
  pushProcLine,
  pushProcChunks,
};

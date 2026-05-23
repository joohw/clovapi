const MAX_SYSTEM_ENTRIES = 200;

let nextSystemId = 1;
/** @type {Array<{ id: string; at: string; stream: string; message: string }>} */
const systemEntries = [];

function nowIso() {
  return new Date().toISOString();
}

function pushSystemEntry(entry) {
  systemEntries.unshift(entry);
  if (systemEntries.length > MAX_SYSTEM_ENTRIES) systemEntries.length = MAX_SYSTEM_ENTRIES;
}

function pushSystemLine(stream, message) {
  const id = String(nextSystemId++);
  const entry = {
    id,
    at: nowIso(),
    stream: String(stream || "system"),
    message: String(message ?? ""),
  };
  pushSystemEntry(entry);
  return id;
}

function pushProcChunks(stream, redactedChunks) {
  const textSource = Buffer.isBuffer(redactedChunks)
    ? redactedChunks.toString("utf8")
    : String(redactedChunks ?? "");
  const normalized = textSource.endsWith("\n") ? textSource.slice(0, -1) : textSource;
  const lines = normalized.split(/\n/).filter((line) => line.length > 0);
  if (!lines.length) {
    if (textSource.trim() !== "") {
      pushSystemLine(stream, textSource);
    }
    return;
  }
  for (const line of lines) {
    pushSystemLine(stream, line);
  }
}

function listSystem() {
  return systemEntries.map((entry) => ({ ...entry }));
}

function clearSystem() {
  systemEntries.length = 0;
}

module.exports = {
  pushSystemLine,
  pushProcChunks,
  listSystem,
  clearSystem,
};

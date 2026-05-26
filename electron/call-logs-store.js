const fs = require("node:fs");
const { callLogsDir, callLogsDBPath } = require("./config-paths");
const { runClovapiArgs } = require("./clovapi-exec");

const DEFAULT_CALL_LOG_PAGE_SIZE = 20;

function normalizePage(input = {}) {
  const limit = Math.max(1, Number(input.limit) || DEFAULT_CALL_LOG_PAGE_SIZE);
  const offset = Math.max(0, Number(input.offset) || 0);
  return { limit, offset };
}

function readCallLogsViaCLI(options = {}) {
  const { limit, offset } = normalizePage(options);
  const result = runClovapiArgs(
    ["proxy", "logs", "list", "--json", "--limit", String(limit + 1), "--offset", String(offset)],
    { timeout: 8000 },
  );
  if (!result.ok) return { entries: [], limit, offset, hasMore: false };
  const raw = String(result.stdout || "").trim();
  if (!raw) return { entries: [], limit, offset, hasMore: false };
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [];
    const hasMore = rows.length > limit;
    return { entries: hasMore ? rows.slice(0, limit) : rows, limit, offset, hasMore };
  } catch {
    return { entries: [], limit, offset, hasMore: false };
  }
}

function readCallLogSessionsViaCLI(limit = 100) {
  const result = runClovapiArgs(
    ["proxy", "logs", "sessions", "--json", "--limit", String(Number(limit) || 100)],
    { timeout: 8000 },
  );
  if (!result.ok) return [];
  const raw = String(result.stdout || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readCallLogs(options = {}) {
  if (fs.existsSync(callLogsDBPath())) {
    const viaCLI = readCallLogsViaCLI(options);
    if (viaCLI.entries.length || viaCLI.offset > 0) return viaCLI;
  }
  return readCallLogsViaCLI(options);
}

async function readCallLogSessions(limit = 100) {
  return readCallLogSessionsViaCLI(limit);
}

async function clearCallLogsFile() {
  runClovapiArgs(["proxy", "logs", "clear", "--yes"], { timeout: 8000 });
}

module.exports = {
  callLogsDir,
  callLogsDBPath,
  callLogsPath: callLogsDBPath,
  DEFAULT_CALL_LOG_PAGE_SIZE,
  readCallLogs,
  readCallLogSessions,
  clearCallLogsFile,
};

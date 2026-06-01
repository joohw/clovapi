const fs = require("node:fs");
const { logsDir, callLogsDBPath } = require("./config-paths");
const { runClovapiArgsAsync } = require("./clovapi-exec");

const DEFAULT_CALL_LOG_PAGE_SIZE = 20;

function normalizePage(input = {}) {
  const limit = Math.max(1, Number(input.limit) || DEFAULT_CALL_LOG_PAGE_SIZE);
  const offset = Math.max(0, Number(input.offset) || 0);
  return { limit, offset };
}

async function readCallLogsViaCLI(options = {}) {
  const { limit, offset } = normalizePage(options);
  const result = await runClovapiArgsAsync(
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

async function readCallLogSessionsViaCLI(limit = 100) {
  const result = await runClovapiArgsAsync(
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
    const viaCLI = await readCallLogsViaCLI(options);
    if (viaCLI.entries.length || viaCLI.offset > 0) return viaCLI;
  }
  return readCallLogsViaCLI(options);
}

async function readCallLogSessions(limit = 100) {
  return readCallLogSessionsViaCLI(limit);
}

async function clearCallLogsFile() {
  await runClovapiArgsAsync(["proxy", "logs", "clear", "--yes"], { timeout: 8000 });
}

async function readSystemLogsViaCLI(limit = 0) {
  const args = ["proxy", "syslogs", "list", "--json"];
  if (limit > 0) args.push("--limit", String(limit));
  const result = await runClovapiArgsAsync(args, { timeout: 10000 });
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

async function clearSystemLogsViaCLI() {
  await runClovapiArgsAsync(["proxy", "syslogs", "clear", "--yes"], { timeout: 10000 });
}

module.exports = {
  logsDir,
  callLogsDBPath,
  callLogsPath: callLogsDBPath,
  DEFAULT_CALL_LOG_PAGE_SIZE,
  readCallLogs,
  readCallLogSessions,
  clearCallLogsFile,
  readSystemLogsViaCLI,
  clearSystemLogsViaCLI,
};

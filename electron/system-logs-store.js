const { runClovapiArgs } = require("./clovapi-exec");

function readSystemLogs(limit = 0) {
  const result = runClovapiArgs(
    ["proxy", "syslogs", "list", "--json", "--limit", String(Number(limit) || 0)],
    { timeout: 8000 },
  );
  if (!result.ok) return [];
  const raw = String(result.stdout || "").trim();
  if (!raw || raw === "null") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearSystemLogsFile() {
  runClovapiArgs(["proxy", "syslogs", "clear", "--yes"], { timeout: 8000 });
}

function logProfilesSaved() {
  runClovapiArgs(["proxy", "syslogs", "log-profiles"], { timeout: 8000 });
}

module.exports = {
  readSystemLogs,
  clearSystemLogsFile,
  logProfilesSaved,
};

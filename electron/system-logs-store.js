const { runClovapiArgsAsync } = require("./clovapi-exec");

async function readSystemLogs(limit = 0) {
  const result = await runClovapiArgsAsync(
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

async function clearSystemLogsFile() {
  await runClovapiArgsAsync(["proxy", "syslogs", "clear", "--yes"], { timeout: 8000 });
}

async function logProfilesSaved() {
  await runClovapiArgsAsync(["proxy", "syslogs", "log-profiles"], { timeout: 8000 });
}

module.exports = {
  readSystemLogs,
  clearSystemLogsFile,
  logProfilesSaved,
};

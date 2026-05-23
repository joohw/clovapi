const fs = require("node:fs");
const path = require("node:path");
const { configDir } = require("./profile-store");
const { runClovapiArgs } = require("./clovapi-exec");

function callLogsDir() {
  return path.join(configDir(), "call-logs");
}

function callLogsDBPath() {
  return path.join(callLogsDir(), "call-logs.sqlite");
}

function readCallLogsViaCLI(limit = 200) {
  const result = runClovapiArgs(
    ["proxy", "logs", "list", "--json", "--limit", String(Number(limit) || 200)],
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

async function readCallLogs(limit = 200) {
  if (fs.existsSync(callLogsDBPath())) {
    const viaCLI = readCallLogsViaCLI(limit);
    if (viaCLI.length) return viaCLI;
  }
  return readCallLogsViaCLI(limit);
}

async function clearCallLogsFile() {
  runClovapiArgs(["proxy", "logs", "clear", "--yes"], { timeout: 8000 });
}

module.exports = {
  callLogsDir,
  callLogsDBPath,
  callLogsPath: callLogsDBPath,
  readCallLogs,
  clearCallLogsFile,
};

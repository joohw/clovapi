const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { configDir } = require("./profile-store");

function callLogsDir() {
  return path.join(configDir(), "call-logs");
}

function callLogsDBPath() {
  return path.join(callLogsDir(), "call-logs.sqlite");
}

function resolveClovapiExecutable() {
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const candidates = [
    process.env.CLOVAPI_ELECTRON_CLI_PATH,
    path.join(__dirname, "..", "switcher", exeName),
    path.join(__dirname, "bin", exeName),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function readCallLogsViaCLI(limit = 200) {
  const exe = resolveClovapiExecutable();
  if (!exe) return [];
  const result = spawnSync(
    exe,
    ["proxy", "logs", "list", "--json", "--limit", String(Number(limit) || 200)],
    { encoding: "utf8", timeout: 8000, windowsHide: true },
  );
  if (result.error || result.status !== 0) return [];
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
  const exe = resolveClovapiExecutable();
  if (!exe) return;
  spawnSync(exe, ["proxy", "logs", "clear", "--yes"], {
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
  });
}

module.exports = {
  callLogsDir,
  callLogsDBPath,
  callLogsPath: callLogsDBPath,
  readCallLogs,
  clearCallLogsFile,
};

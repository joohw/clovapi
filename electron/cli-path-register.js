const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { cliBinPath } = require("./config-paths");

const MARKER_START = "# >>> clovapi >>>";
const MARKER_END = "# <<< clovapi <<<";

function cliBinDir() {
  return path.dirname(cliBinPath());
}

function shellPathExportLine(dir) {
  const normalized = String(dir || "").trim();
  if (!normalized) return "";
  if (process.platform === "win32") return "";
  return `export PATH="${normalized}:$PATH"`;
}

function buildPathBlock(dir) {
  const line = shellPathExportLine(dir);
  return [MARKER_START, line, MARKER_END, ""].join("\n");
}

function shellProfileCandidates() {
  const home = os.homedir();
  if (!home || process.platform === "win32") return [];
  if (process.platform === "darwin") {
    return [
      path.join(home, ".zprofile"),
      path.join(home, ".zshrc"),
      path.join(home, ".bash_profile"),
      path.join(home, ".bashrc"),
    ];
  }
  return [path.join(home, ".profile"), path.join(home, ".bashrc"), path.join(home, ".zshrc")];
}

function pickShellProfile(candidates) {
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return file;
    } catch {
      /* ignore */
    }
  }
  return candidates[0] || "";
}

function upsertMarkedBlock(content, block) {
  const text = String(content || "");
  const start = text.indexOf(MARKER_START);
  const end = text.indexOf(MARKER_END);
  if (start >= 0 && end > start) {
    const before = text.slice(0, start);
    const after = text.slice(end + MARKER_END.length);
    const prefix = before.endsWith("\n") || before.length === 0 ? before : `${before}\n`;
    const suffix = after.startsWith("\n") ? after : `\n${after}`;
    return `${prefix}${block}${suffix}`.replace(/\n{3,}/g, "\n\n");
  }
  if (text.length === 0) return block;
  return `${text.endsWith("\n") ? text : `${text}\n`}${block}`;
}

function ensureUnixShellPath(binDir) {
  const candidates = shellProfileCandidates();
  const target = pickShellProfile(candidates);
  if (!target) {
    return { ok: false, changed: false, path: binDir, error: "no shell profile target" };
  }

  let existing = "";
  try {
    if (fs.existsSync(target)) existing = fs.readFileSync(target, "utf8");
  } catch (error) {
    return {
      ok: false,
      changed: false,
      path: binDir,
      profile: target,
      error: error instanceof Error ? error.message : "read shell profile failed",
    };
  }

  if (existing.includes(MARKER_START) || existing.includes(`${binDir}:`)) {
    return { ok: true, changed: false, path: binDir, profile: target, already: true };
  }

  const block = buildPathBlock(binDir);
  const next = upsertMarkedBlock(existing, block);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, next, { mode: 0o600 });
  } catch (error) {
    return {
      ok: false,
      changed: false,
      path: binDir,
      profile: target,
      error: error instanceof Error ? error.message : "write shell profile failed",
    };
  }
  return { ok: true, changed: true, path: binDir, profile: target };
}

function readWindowsUserPath() {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "[Environment]::GetEnvironmentVariable('Path', 'User')",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function writeWindowsUserPath(value) {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `[Environment]::SetEnvironmentVariable('Path', '${String(value || "").replace(/'/g, "''")}', 'User')`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return result.status === 0;
}

function ensureWindowsUserPath(binDir) {
  const current = readWindowsUserPath();
  const parts = current
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalized = path.normalize(binDir);
  if (parts.some((part) => path.normalize(part) === normalized)) {
    return { ok: true, changed: false, path: binDir, already: true };
  }
  const next = [normalized, ...parts].join(";");
  if (!writeWindowsUserPath(next)) {
    return { ok: false, changed: false, path: binDir, error: "failed to update Windows user PATH" };
  }
  return { ok: true, changed: true, path: binDir };
}

/**
 * Idempotently register ~/.config/clovapi/bin (or %APPDATA%\\clovapi\\bin) on the user PATH.
 * Desktop and npm both install the canonical binary here.
 */
function ensureCliBinOnPath() {
  const binDir = cliBinPath();
  try {
    if (!fs.existsSync(binDir)) {
      return { ok: false, changed: false, path: path.dirname(binDir), error: "clovapi binary not installed yet" };
    }
  } catch (error) {
    return {
      ok: false,
      changed: false,
      path: path.dirname(binDir),
      error: error instanceof Error ? error.message : "stat clovapi binary failed",
    };
  }

  const dir = path.dirname(binDir);
  if (process.platform === "win32") {
    return ensureWindowsUserPath(dir);
  }
  return ensureUnixShellPath(dir);
}

function cliSpawnEnv(baseEnv = process.env) {
  const binDir = cliBinDir();
  const parts = [binDir];
  const seen = new Set([binDir]);
  for (const entry of String(baseEnv.PATH || "").split(path.delimiter)) {
    const value = String(entry || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    parts.push(value);
  }
  return { ...baseEnv, PATH: parts.join(path.delimiter) };
}

module.exports = {
  MARKER_END,
  MARKER_START,
  buildPathBlock,
  cliBinDir,
  cliSpawnEnv,
  ensureCliBinOnPath,
  shellProfileCandidates,
  upsertMarkedBlock,
};

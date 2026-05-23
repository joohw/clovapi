const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function buildBundledCandidates(extraCandidates = []) {
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const defaults = [
    path.join(__dirname, "bin", exeName),
    path.join(__dirname, "..", "switcher", exeName),
    path.join(process.cwd(), "switcher", exeName),
  ];
  return [...extraCandidates, ...defaults].filter(Boolean);
}

function resolveClovapiExecutable(options = {}) {
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  if (process.env.CLOVAPI_ELECTRON_CLI_PATH) {
    try {
      if (fs.existsSync(process.env.CLOVAPI_ELECTRON_CLI_PATH)) {
        return process.env.CLOVAPI_ELECTRON_CLI_PATH;
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const resolver = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(resolver, [exeName], {
      encoding: "utf8",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    if (result.status === 0) {
      const resolved =
        String(result.stdout || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)[0] || "";
      if (resolved && fs.existsSync(resolved)) return resolved;
    }
  } catch {
    /* ignore */
  }
  for (const candidate of buildBundledCandidates(options.extraCandidates)) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function runClovapiArgs(args, options = {}) {
  const exe = resolveClovapiExecutable(options);
  if (!exe) {
    return {
      ok: false,
      stdout: "",
      stderr: "clovapi executable not found",
      status: 1,
      error: new Error("clovapi executable not found"),
    };
  }
  const input = options.input != null ? String(options.input) : undefined;
  const result = spawnSync(exe, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 8000,
    windowsHide: true,
    input,
  });
  const status = result.status ?? 1;
  return {
    ok: !result.error && status === 0,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    status,
    error: result.error || null,
  };
}

module.exports = {
  buildBundledCandidates,
  resolveClovapiExecutable,
  runClovapiArgs,
};

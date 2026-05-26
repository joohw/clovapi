const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { cliBinPath } = require("./config-paths");

function isDevEnvironment() {
  return process.env.ELECTRON_DEV === "1";
}

function coreDevStatePath() {
  return path.join(__dirname, "..", "core", ".dev", "current.json");
}

function resolveCoreDevBinary() {
  try {
    const raw = fs.readFileSync(coreDevStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    const candidate = typeof parsed?.path === "string" ? parsed.path : "";
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch {
    /* ignore */
  }
  return "";
}

function developmentCandidates(exeName) {
  return [
    resolveCoreDevBinary(),
    path.join(__dirname, "..", "core", exeName),
    path.join(process.cwd(), "core", exeName),
    path.join(__dirname, "bin", exeName),
  ];
}

function packagedBundledCandidates(exeName) {
  const candidates = [];
  const resourcesPath = process.resourcesPath;
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, "bin", exeName));
  }
  try {
    const { app } = require("electron");
    const appPath = app?.getAppPath?.();
    if (appPath) {
      candidates.push(path.join(appPath, "bin", exeName));
    }
  } catch {
    /* not running inside Electron */
  }
  return candidates;
}

function buildBundledCandidates(extraCandidates = []) {
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const userPath = cliBinPath();
  const extras = extraCandidates.filter(Boolean);
  const defaults = isDevEnvironment()
    ? [...developmentCandidates(exeName), ...extras, userPath, ...packagedBundledCandidates(exeName)]
    : [userPath, ...extras, ...packagedBundledCandidates(exeName), ...developmentCandidates(exeName)];
  return defaults.filter(Boolean);
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
  if (isDevEnvironment()) {
    for (const candidate of buildBundledCandidates(options.extraCandidates)) {
      try {
        if (candidate && fs.existsSync(candidate)) return candidate;
      } catch {
        /* ignore */
      }
    }
  }
  const userPath = cliBinPath();
  try {
    if (fs.existsSync(userPath)) return userPath;
  } catch {
    /* ignore */
  }
  const localCandidates = buildBundledCandidates(options.extraCandidates).filter(
    (candidate) => path.resolve(candidate) !== path.resolve(userPath)
  );
  for (const candidate of localCandidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
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

function runClovapiArgsAsync(args, options = {}) {
  return new Promise((resolve) => {
    const exe = resolveClovapiExecutable(options);
    if (!exe) {
      resolve({
        ok: false,
        stdout: "",
        stderr: "clovapi executable not found",
        status: 1,
        error: new Error("clovapi executable not found"),
      });
      return;
    }

    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    let timedOut = false;
    const timeoutMs = options.timeout ?? 8000;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on("data", (chunk) => stdoutChunks.push(String(chunk || "")));
    child.stderr.on("data", (chunk) => stderrChunks.push(String(chunk || "")));
    child.on("error", (error) => {
      finish({
        ok: false,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        status: 1,
        error,
      });
    });
    child.on("close", (code, signal) => {
      const error = timedOut
        ? Object.assign(new Error("clovapi command timed out"), { code: "ETIMEDOUT" })
        : null;
      finish({
        ok: !error && code === 0,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        status: code ?? 1,
        signal,
        error,
      });
    });

    if (options.input != null) {
      child.stdin.end(String(options.input));
    } else {
      child.stdin.end();
    }
  });
}

module.exports = {
  buildBundledCandidates,
  coreDevStatePath,
  resolveClovapiExecutable,
  runClovapiArgs,
  runClovapiArgsAsync,
};

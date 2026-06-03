const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { cliBinPath } = require("./config-paths");
const { installBinaryWindows } = require("./cli-win-replace");
const { cliSpawnEnv, ensureCliBinOnPath } = require("./cli-path-register");

const DOWNLOAD_BASE = "https://downloads.clovapi.com/clovapi";
const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};
const ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

let executableResolveCache = { key: "", path: "" };
const executableResolveInFlight = new Map();

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

async function existsAsync(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCoreDevBinaryAsync() {
  try {
    const raw = await fsp.readFile(coreDevStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    const candidate = typeof parsed?.path === "string" ? parsed.path : "";
    if (candidate && await existsAsync(candidate)) return candidate;
  } catch {
    /* ignore */
  }
  return "";
}

function developmentCandidates() {
  const devWatchBinary = resolveCoreDevBinary();
  return devWatchBinary ? [devWatchBinary] : [];
}

function buildDevCandidates(extraCandidates = []) {
  const userPath = cliBinPath();
  return [...extraCandidates.filter(Boolean), ...developmentCandidates(), userPath].filter(Boolean);
}

async function buildDevCandidatesAsync(extraCandidates = []) {
  const userPath = cliBinPath();
  const devWatchBinary = await resolveCoreDevBinaryAsync();
  return [...extraCandidates.filter(Boolean), devWatchBinary, userPath].filter(Boolean);
}

function resolveClovapiExecutable(options = {}) {
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const extraCandidates = Array.isArray(options.extraCandidates) ? options.extraCandidates : [];

  if (isDevEnvironment()) {
    if (process.env.CLOVAPI_ELECTRON_CLI_PATH) {
      try {
        if (fs.existsSync(process.env.CLOVAPI_ELECTRON_CLI_PATH)) {
          return process.env.CLOVAPI_ELECTRON_CLI_PATH;
        }
      } catch {
        /* ignore */
      }
    }
    for (const candidate of buildDevCandidates(extraCandidates)) {
      try {
        if (candidate && fs.existsSync(candidate)) return candidate;
      } catch {
        /* ignore */
      }
    }
  } else {
    const userPath = cliBinPath();
    try {
      if (fs.existsSync(userPath)) return userPath;
    } catch {
      /* ignore */
    }
    try {
      const installed = installOnlineCliSync();
      if (installed && fs.existsSync(installed)) return installed;
    } catch {
      /* fall through to PATH candidates */
    }
  }

  try {
    const resolver = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(resolver, [exeName], {
      encoding: "utf8",
      windowsHide: true,
      shell: process.platform === "win32",
      env: cliSpawnEnv(),
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

function runDownloadCommand(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: options.encoding ?? "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw result.error || new Error(String(result.stderr || result.stdout || `${args[0]} failed`).trim());
  }
  return result.stdout || "";
}

function runCommandAsync(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      windowsHide: true,
      shell: options.shell || false,
      env: options.env,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.stdout?.on("data", (chunk) => stdoutChunks.push(String(chunk || "")));
    child.stderr?.on("data", (chunk) => stderrChunks.push(String(chunk || "")));
    child.on("error", (error) => {
      finish({ status: 1, stdout: stdoutChunks.join(""), stderr: stderrChunks.join(""), error });
    });
    child.on("close", (code, signal) => {
      finish({
        status: code ?? 1,
        signal,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        error: null,
      });
    });
  });
}

function downloadTextSync(url) {
  if (process.platform === "win32") {
    return runDownloadCommand([
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -UseBasicParsing -Uri '${url}').Content`,
    ]);
  }
  return runDownloadCommand(["curl", "-fsSL", url]);
}

async function downloadTextAsync(url) {
  const result = process.platform === "win32"
    ? await runCommandAsync([
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -UseBasicParsing -Uri '${url}').Content`,
      ])
    : await runCommandAsync(["curl", "-fsSL", url]);
  if (result.status !== 0 || result.error) {
    throw result.error || new Error(String(result.stderr || result.stdout || "download failed").trim());
  }
  return result.stdout || "";
}

function downloadFileSync(url, outPath) {
  if (process.platform === "win32") {
    runDownloadCommand([
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile '${outPath}'`,
    ]);
    return;
  }
  runDownloadCommand(["curl", "-fsSL", "-o", outPath, url]);
}

async function downloadFileAsync(url, outPath) {
  const result = process.platform === "win32"
    ? await runCommandAsync([
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile '${outPath}'`,
      ])
    : await runCommandAsync(["curl", "-fsSL", "-o", outPath, url]);
  if (result.status !== 0 || result.error) {
    throw result.error || new Error(String(result.stderr || result.stdout || "download failed").trim());
  }
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function sha256FileAsync(filePath) {
  return crypto.createHash("sha256").update(await fsp.readFile(filePath)).digest("hex");
}

function parseChecksum(content, fileName) {
  const line = String(content || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.endsWith(` ${fileName}`));
  if (!line) {
    throw new Error(`checksum not found for ${fileName}`);
  }
  return line.split(/\s+/)[0];
}

function latestTagSync() {
  const raw = String(process.env.CLOVAPI_DESKTOP_CLI_VERSION || "").trim();
  if (raw) return raw.startsWith("v") ? raw : `v${raw}`;
  const latestURL = String(process.env.CLOVAPI_CLI_LATEST_URL || `${DOWNLOAD_BASE}/latest.txt`).trim();
  const latest = downloadTextSync(latestURL).trim();
  if (!latest) throw new Error("latest version response was empty");
  return latest.startsWith("v") ? latest : `v${latest}`;
}

async function latestTagAsync() {
  const raw = String(process.env.CLOVAPI_DESKTOP_CLI_VERSION || "").trim();
  if (raw) return raw.startsWith("v") ? raw : `v${raw}`;
  const latestURL = String(process.env.CLOVAPI_CLI_LATEST_URL || `${DOWNLOAD_BASE}/latest.txt`).trim();
  const latest = (await downloadTextAsync(latestURL)).trim();
  if (!latest) throw new Error("latest version response was empty");
  return latest.startsWith("v") ? latest : `v${latest}`;
}

function releaseBaseURLs(versionTag) {
  if (process.env.CLOVAPI_CLI_BASE_URL) {
    return [String(process.env.CLOVAPI_CLI_BASE_URL).replace(/\/+$/, "")];
  }
  const r2Base = String(process.env.CLOVAPI_R2_BASE_URL || `${DOWNLOAD_BASE}/${versionTag}`).replace(/\/+$/, "");
  return [r2Base, `https://github.com/joohw/clovapi/releases/download/${versionTag}`];
}

function extractArchiveSync(archivePath, archiveName, outDir) {
  if (archiveName.endsWith(".zip")) {
    runDownloadCommand([
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${outDir}' -Force`,
    ]);
    return;
  }
  runDownloadCommand(["tar", "-xzf", archivePath, "-C", outDir]);
}

async function extractArchiveAsync(archivePath, archiveName, outDir) {
  const result = archiveName.endsWith(".zip")
    ? await runCommandAsync([
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${outDir}' -Force`,
      ])
    : await runCommandAsync(["tar", "-xzf", archivePath, "-C", outDir]);
  if (result.status !== 0 || result.error) {
    throw result.error || new Error(String(result.stderr || result.stdout || "extract failed").trim());
  }
}

function installOnlineCliSync() {
  const osName = PLATFORM_MAP[process.platform];
  const archName = ARCH_MAP[process.arch];
  if (!osName || !archName) {
    throw new Error(`unsupported platform: ${process.platform}/${process.arch}`);
  }

  const versionTag = latestTagSync();
  const version = versionTag.replace(/^v/, "");
  const ext = osName === "windows" ? "zip" : "tar.gz";
  const archiveName = `clovapi_${version}_${osName}_${archName}.${ext}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-desktop-install-"));
  const archivePath = path.join(tmpDir, archiveName);
  let lastError = null;

  for (const base of releaseBaseURLs(versionTag)) {
    try {
      const checksum = downloadTextSync(`${base}/checksums.txt`);
      downloadFileSync(`${base}/${archiveName}`, archivePath);
      const expected = parseChecksum(checksum, archiveName);
      const actual = sha256File(archivePath);
      if (expected !== actual) {
        throw new Error(`checksum mismatch for ${archiveName}`);
      }
      const extractDir = path.join(tmpDir, "extract");
      fs.mkdirSync(extractDir, { recursive: true });
      extractArchiveSync(archivePath, archiveName, extractDir);
      const extracted = path.join(extractDir, process.platform === "win32" ? "clovapi.exe" : "clovapi");
      if (!fs.existsSync(extracted)) {
        throw new Error(`binary not found in ${archiveName}`);
      }
      const target = cliBinPath();
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (process.platform === "win32") {
        installBinaryWindows(extracted, target);
      } else {
        fs.copyFileSync(extracted, target);
        fs.chmodSync(target, 0o755);
      }
      fs.writeFileSync(path.join(path.dirname(target), "version.txt"), `${version}\n`, { mode: 0o600 });
      try {
        ensureCliBinOnPath();
      } catch {
        /* PATH registration is best-effort */
      }
      return target;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("all CLI download sources failed");
}

async function installOnlineCliAsync() {
  const osName = PLATFORM_MAP[process.platform];
  const archName = ARCH_MAP[process.arch];
  if (!osName || !archName) {
    throw new Error(`unsupported platform: ${process.platform}/${process.arch}`);
  }

  const versionTag = await latestTagAsync();
  const version = versionTag.replace(/^v/, "");
  const ext = osName === "windows" ? "zip" : "tar.gz";
  const archiveName = `clovapi_${version}_${osName}_${archName}.${ext}`;
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "clovapi-desktop-install-"));
  const archivePath = path.join(tmpDir, archiveName);
  let lastError = null;

  for (const base of releaseBaseURLs(versionTag)) {
    try {
      const checksum = await downloadTextAsync(`${base}/checksums.txt`);
      await downloadFileAsync(`${base}/${archiveName}`, archivePath);
      const expected = parseChecksum(checksum, archiveName);
      const actual = await sha256FileAsync(archivePath);
      if (expected !== actual) {
        throw new Error(`checksum mismatch for ${archiveName}`);
      }
      const extractDir = path.join(tmpDir, "extract");
      await fsp.mkdir(extractDir, { recursive: true });
      await extractArchiveAsync(archivePath, archiveName, extractDir);
      const extracted = path.join(extractDir, process.platform === "win32" ? "clovapi.exe" : "clovapi");
      if (!await existsAsync(extracted)) {
        throw new Error(`binary not found in ${archiveName}`);
      }
      const target = cliBinPath();
      await fsp.mkdir(path.dirname(target), { recursive: true });
      if (process.platform === "win32") {
        installBinaryWindows(extracted, target);
      } else {
        await fsp.copyFile(extracted, target);
        await fsp.chmod(target, 0o755);
      }
      await fsp.writeFile(path.join(path.dirname(target), "version.txt"), `${version}\n`, { mode: 0o600 });
      try {
        ensureCliBinOnPath();
      } catch {
        /* PATH registration is best-effort */
      }
      executableResolveCache = { key: "", path: "" };
      return target;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("all CLI download sources failed");
}

function executableResolveCacheKey(options = {}) {
  return JSON.stringify({
    dev: process.env.ELECTRON_DEV === "1",
    override: process.env.CLOVAPI_ELECTRON_CLI_PATH || "",
    appdata: process.env.APPDATA || "",
    xdg: process.env.XDG_CONFIG_HOME || "",
    extra: Array.isArray(options.extraCandidates) ? options.extraCandidates.filter(Boolean) : [],
  });
}

async function resolveClovapiExecutableAsync(options = {}) {
  const cacheKey = executableResolveCacheKey(options);
  if (
    executableResolveCache.key === cacheKey &&
    executableResolveCache.path &&
    await existsAsync(executableResolveCache.path)
  ) {
    return executableResolveCache.path;
  }
  if (executableResolveInFlight.has(cacheKey)) return executableResolveInFlight.get(cacheKey);

  const resolveTask = (async () => {
    const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
    const extraCandidates = Array.isArray(options.extraCandidates) ? options.extraCandidates : [];
    let resolved = "";

    if (isDevEnvironment()) {
      const override = String(process.env.CLOVAPI_ELECTRON_CLI_PATH || "").trim();
      if (override && await existsAsync(override)) {
        resolved = override;
      }
      if (!resolved) {
        for (const candidate of await buildDevCandidatesAsync(extraCandidates)) {
          if (candidate && await existsAsync(candidate)) {
            resolved = candidate;
            break;
          }
        }
      }
    } else {
      const userPath = cliBinPath();
      if (await existsAsync(userPath)) {
        resolved = userPath;
      }
      if (!resolved && options.allowInstall !== false) {
        try {
          const installed = await installOnlineCliAsync();
          if (installed && await existsAsync(installed)) resolved = installed;
        } catch {
          /* fall through to PATH candidates */
        }
      }
    }

    if (!resolved) {
      try {
        const resolver = process.platform === "win32" ? "where" : "which";
        const result = await runCommandAsync([resolver, exeName], {
          shell: process.platform === "win32",
          env: cliSpawnEnv(),
        });
        if (result.status === 0) {
          const candidate =
            String(result.stdout || "")
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)[0] || "";
          if (candidate && await existsAsync(candidate)) resolved = candidate;
        }
      } catch {
        /* ignore */
      }
    }

    executableResolveCache = { key: cacheKey, path: resolved || "" };
    return resolved || "";
  })();
  executableResolveInFlight.set(cacheKey, resolveTask);

  try {
    return await resolveTask;
  } finally {
    executableResolveInFlight.delete(cacheKey);
  }
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
    env: cliSpawnEnv(options.env),
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

function spawnClovapiProcess(exe, args, options = {}) {
  const spawnOptions = {
    windowsHide: true,
    stdio: options.stdio || ["pipe", "pipe", "pipe"],
    env: cliSpawnEnv(options.env),
    ...options.spawnExtra,
  };
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    spawnOptions.shell = true;
  }
  return spawn(exe, args, spawnOptions);
}

async function runClovapiArgsAsync(args, options = {}) {
  const exe = await resolveClovapiExecutableAsync(options);
  if (!exe) {
    return {
      ok: false,
      stdout: "",
      stderr: "clovapi executable not found",
      status: 1,
      error: new Error("clovapi executable not found"),
    };
  }
  return new Promise((resolve) => {
    const child = spawnClovapiProcess(exe, args, options);
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

function readCoreExecutableVersion(exe) {
  const target = String(exe || "").trim();
  if (!target) return "";
  const result = spawnSync(target, ["version"], {
    encoding: "utf8",
    windowsHide: true,
    env: cliSpawnEnv(),
  });
  const line = String(result.stdout || "")
    .trim()
    .split(/\r?\n/)[0];
  const match = line.match(/^clovapi\s+(\S+)/);
  return match?.[1]?.trim() || "";
}

async function readCoreExecutableVersionAsync(exe) {
  const target = String(exe || "").trim();
  if (!target) return "";
  const result = await runCommandAsync([target, "version"], { env: cliSpawnEnv() });
  const line = String(result.stdout || "")
    .trim()
    .split(/\r?\n/)[0];
  const match = line.match(/^clovapi\s+(\S+)/);
  return match?.[1]?.trim() || "";
}

/** cancelKey -> child process for long-running commands (OAuth login, etc.). */
const activeLongRuns = new Map();

function emitLongRunOutput(onOutput, kind, chunk) {
  if (typeof onOutput !== "function") return;
  onOutput(kind, chunk);
}

function killChildTree(child) {
  if (!child) return;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    return;
  }
  child.kill("SIGTERM");
}

async function runClovapiLongAsync(args, options = {}) {
  const cancelKey = String(options.cancelKey || "").trim();
  if (cancelKey && activeLongRuns.has(cancelKey)) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      status: 1,
      error: new Error("command already running"),
    };
  }

  const exe = await resolveClovapiExecutableAsync(options);
  if (!exe) {
    return {
      ok: false,
      stdout: "",
      stderr: "clovapi executable not found",
      status: 1,
      error: new Error("clovapi executable not found"),
    };
  }

  return new Promise((resolve) => {
    const child = spawnClovapiProcess(exe, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: cliSpawnEnv(options.env),
    });
    if (cancelKey) {
      activeLongRuns.set(cancelKey, child);
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const onOutput = options.onOutput;
    const longRunTimeout = Number(options.timeout);
    let timeoutTimer = null;
    if (Number.isFinite(longRunTimeout) && longRunTimeout > 0) {
      timeoutTimer = setTimeout(() => {
        emitLongRunOutput(onOutput, "system", `\n[timeout] after ${longRunTimeout}ms\n`);
        killChildTree(child);
      }, longRunTimeout);
      timeoutTimer.unref?.();
    }
    emitLongRunOutput(onOutput, "system", `$ ${exe} ${args.join(" ")}\n`);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (cancelKey) activeLongRuns.delete(cancelKey);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve(result);
    };

    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "");
      stdoutChunks.push(text);
      emitLongRunOutput(onOutput, "stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      stderrChunks.push(text);
      emitLongRunOutput(onOutput, "stderr", chunk);
    });
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
      emitLongRunOutput(onOutput, "system", `\n[exit] code=${String(code)} signal=${String(signal)}\n`);
      finish({
        ok: code === 0 && !signal,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        status: code ?? 1,
        signal,
        cancelled: Boolean(signal),
        error: signal ? Object.assign(new Error("cancelled"), { code: "ECANCELLED" }) : null,
      });
    });
  });
}

function cancelClovapiLongRun(cancelKey) {
  const key = String(cancelKey || "").trim();
  const child = activeLongRuns.get(key);
  if (!child) {
    return { ok: false, error: "not running" };
  }
  killChildTree(child);
  return { ok: true };
}

module.exports = {
  buildDevCandidates,
  coreDevStatePath,
  readCoreExecutableVersion,
  readCoreExecutableVersionAsync,
  resolveClovapiExecutable,
  resolveClovapiExecutableAsync,
  runClovapiArgs,
  runClovapiArgsAsync,
  runClovapiLongAsync,
  cancelClovapiLongRun,
};

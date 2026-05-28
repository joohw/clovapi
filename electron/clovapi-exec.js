const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { cliBinPath } = require("./config-paths");
const { installBinaryWindows } = require("./cli-win-replace");

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

function developmentCandidates() {
  const devWatchBinary = resolveCoreDevBinary();
  return devWatchBinary ? [devWatchBinary] : [];
}

function buildDevCandidates(extraCandidates = []) {
  const userPath = cliBinPath();
  return [...extraCandidates.filter(Boolean), ...developmentCandidates(), userPath].filter(Boolean);
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

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
      return target;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("all CLI download sources failed");
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

function readCoreExecutableVersion(exe) {
  const target = String(exe || "").trim();
  if (!target) return "";
  const result = spawnSync(target, ["version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const line = String(result.stdout || "")
    .trim()
    .split(/\r?\n/)[0];
  const match = line.match(/^clovapi\s+(\S+)/);
  return match?.[1]?.trim() || "";
}

module.exports = {
  buildDevCandidates,
  coreDevStatePath,
  readCoreExecutableVersion,
  resolveClovapiExecutable,
  runClovapiArgs,
  runClovapiArgsAsync,
};

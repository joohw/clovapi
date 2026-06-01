const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");

const DEFAULT_DOWNLOAD_ROOT = "https://downloads.clovapi.com/desktop";
const DEFAULT_LATEST_URL = "https://downloads.clovapi.com/desktop/latest.txt";

const INSTALLER_BY_PLATFORM = {
  darwin: "clovapi-desktop-darwin-universal.dmg",
  win32: "clovapi-desktop-windows-x64.exe",
};

function normalizeVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function isNewerVersion(latest, current) {
  if (!normalizeVersion(latest) || !normalizeVersion(current)) return false;
  return compareVersions(latest, current) > 0;
}

function latestDesktopUrl() {
  return String(process.env.CLOVAPI_DESKTOP_LATEST_URL || DEFAULT_LATEST_URL).trim();
}

function desktopDownloadRoot() {
  const override = String(process.env.CLOVAPI_DESKTOP_DOWNLOAD_ROOT || "").trim();
  if (override) return override.replace(/\/+$/, "");
  const legacyBase = String(process.env.CLOVAPI_DESKTOP_DOWNLOAD_BASE || "").trim().replace(/\/+$/, "");
  if (legacyBase.endsWith("/latest")) {
    return legacyBase.slice(0, -"/latest".length);
  }
  return DEFAULT_DOWNLOAD_ROOT;
}

function normalizeTag(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function installerFileName(platform = process.platform) {
  const name = INSTALLER_BY_PLATFORM[platform];
  if (!name) {
    throw new Error(`Desktop updates are not supported on ${platform}.`);
  }
  return name;
}

function installerDownloadUrl(versionTag, platform = process.platform) {
  const tag = normalizeTag(versionTag);
  if (!tag) {
    throw new Error("Desktop version tag is required.");
  }
  return `${desktopDownloadRoot()}/${tag}/${installerFileName(platform)}`;
}

function fetchText(url, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const transport = requestUrl.protocol === "http:" ? http : https;
    const request = transport.get(
      requestUrl,
      {
        headers: { "User-Agent": "ClovAPI-Switcher-Desktop-Update" },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          fetchText(new URL(response.headers.location, requestUrl).toString(), timeoutMs)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode || 0} fetching ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out fetching ${url}`));
    });
    request.on("error", reject);
  });
}

function normalizeDownloadProgress(downloadedBytes, totalBytes) {
  const downloaded = Math.max(0, Number(downloadedBytes) || 0);
  const total = Math.max(0, Number(totalBytes) || 0);
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((downloaded / total) * 100))) : 0;
  return {
    received_bytes: downloaded,
    total_bytes: total,
    percent,
  };
}

function downloadFile(url, outPath, timeoutMs = 30 * 60_000, onProgress = null) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const transport = requestUrl.protocol === "http:" ? http : https;
    const emitProgress =
      typeof onProgress === "function"
        ? (downloadedBytes, totalBytes) => onProgress(normalizeDownloadProgress(downloadedBytes, totalBytes))
        : () => {};
    const request = transport.get(
      requestUrl,
      {
        headers: { "User-Agent": "ClovAPI-Switcher-Desktop-Update" },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          downloadFile(new URL(response.headers.location, requestUrl).toString(), outPath, timeoutMs, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode || 0} downloading ${url}`));
          return;
        }
        const totalBytes = Number.parseInt(String(response.headers["content-length"] || ""), 10) || 0;
        let downloadedBytes = 0;
        emitProgress(0, totalBytes);
        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          emitProgress(downloadedBytes, totalBytes);
        });
        response.on("error", reject);
        const file = fs.createWriteStream(outPath);
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            emitProgress(totalBytes > 0 ? totalBytes : downloadedBytes, totalBytes || downloadedBytes);
            resolve(outPath);
          });
        });
        file.on("error", (error) => {
          file.close(() => {
            fs.rm(outPath, { force: true }, () => reject(error));
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out downloading ${url}`));
    });
    request.on("error", reject);
  });
}

async function fetchLatestDesktopVersion() {
  const latest = (await fetchText(latestDesktopUrl())).trim();
  if (!latest) throw new Error("Desktop latest version response was empty.");
  return latest.startsWith("v") ? latest : `v${latest}`;
}

async function checkDesktopUpdate(currentVersion) {
  const current = normalizeVersion(currentVersion);
  if (!current) {
    return { ok: false, error: "Current desktop version is unavailable." };
  }
  if (!INSTALLER_BY_PLATFORM[process.platform]) {
    return { ok: false, error: `Desktop updates are not supported on ${process.platform}.` };
  }

  const latestTag = await fetchLatestDesktopVersion();
  const latest = normalizeVersion(latestTag);
  const upToDate = !isNewerVersion(latest, current);

  return {
    ok: true,
    current_version: current,
    latest_version: latest,
    latest_tag: latestTag,
    up_to_date: upToDate,
    download_url: upToDate ? "" : installerDownloadUrl(latestTag),
    installer_name: installerFileName(),
  };
}

function installerChecksumUrl(versionTag, platform = process.platform) {
  return `${installerDownloadUrl(versionTag, platform)}.sha256`;
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// parseChecksumDigest extracts the hex digest from a `sha256sum`-style file
// (either a bare digest or "<digest>  <filename>").
function parseChecksumDigest(text) {
  const token = String(text || "").trim().split(/\s+/)[0] || "";
  return /^[0-9a-f]{64}$/i.test(token) ? token.toLowerCase() : "";
}

// verifyInstallerChecksum fetches the published .sha256 sidecar and verifies the
// downloaded installer. Returns true when verified, false when no checksum is
// published (non-breaking for releases without sidecars), and throws on mismatch.
async function verifyInstallerChecksum(installerPath, versionTag) {
  let expected = "";
  try {
    expected = parseChecksumDigest(await fetchText(installerChecksumUrl(versionTag)));
  } catch {
    return false;
  }
  if (!expected) return false;
  const actual = (await sha256OfFile(installerPath)).toLowerCase();
  if (actual !== expected) {
    throw new Error(
      `Installer checksum mismatch (expected ${expected}, got ${actual}); refusing to launch.`,
    );
  }
  return true;
}

function resolveDesktopInstallDir() {
  const execPath = process.execPath;
  if (!execPath) return "";
  if (process.platform === "darwin") {
    // .../ClovAPI Switcher.app/Contents/MacOS/ClovAPI Switcher
    const macOSDir = path.dirname(path.dirname(path.dirname(execPath)));
    return macOSDir.endsWith(".app") ? macOSDir : "";
  }
  return path.dirname(execPath);
}

function installerLaunchArgs(installDir = resolveDesktopInstallDir()) {
  if (process.platform === "win32") {
    const dir = String(installDir || "").trim();
    // NSIS silent upgrade: /S hides the wizard; /D= must be last and has no quotes.
    if (dir) return ["/S", `/D=${dir}`];
    return ["/S"];
  }
  return [];
}

function macOSInstallScriptContent() {
  return `#!/bin/sh
set -u

DMG_PATH="$1"
TARGET_APP="$2"
PARENT_PID="$3"
LOG_PATH="$4"

log() {
  printf '%s %s\\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_PATH"
}

fallback_open_dmg() {
  log "Falling back to opening DMG"
  open "$DMG_PATH" >> "$LOG_PATH" 2>&1 || true
}

while kill -0 "$PARENT_PID" 2>/dev/null; do
  sleep 0.2
done

MOUNT_DIR="$(mktemp -d "/tmp/clovapi-desktop-dmg.XXXXXX")"
cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet >> "$LOG_PATH" 2>&1 || true
  rmdir "$MOUNT_DIR" >> "$LOG_PATH" 2>&1 || true
}
trap cleanup EXIT

log "Attaching DMG: $DMG_PATH"
if ! hdiutil attach "$DMG_PATH" -nobrowse -quiet -mountpoint "$MOUNT_DIR" >> "$LOG_PATH" 2>&1; then
  fallback_open_dmg
  exit 1
fi

SOURCE_APP="$(find "$MOUNT_DIR" -maxdepth 1 -type d -name "*.app" | head -n 1)"
if [ -z "$SOURCE_APP" ]; then
  log "No .app bundle found in DMG"
  fallback_open_dmg
  exit 1
fi

TARGET_DIR="$(dirname "$TARGET_APP")"
TARGET_NAME="$(basename "$TARGET_APP")"
STAGING_APP="$TARGET_DIR/.$TARGET_NAME.updating.$$"

log "Copying $SOURCE_APP to staging path $STAGING_APP"
rm -rf "$STAGING_APP" >> "$LOG_PATH" 2>&1 || true
if ! ditto "$SOURCE_APP" "$STAGING_APP" >> "$LOG_PATH" 2>&1; then
  rm -rf "$STAGING_APP" >> "$LOG_PATH" 2>&1 || true
  fallback_open_dmg
  exit 1
fi

log "Replacing installed app at $TARGET_APP"
if ! rm -rf "$TARGET_APP" >> "$LOG_PATH" 2>&1; then
  rm -rf "$STAGING_APP" >> "$LOG_PATH" 2>&1 || true
  fallback_open_dmg
  exit 1
fi
if ! mv "$STAGING_APP" "$TARGET_APP" >> "$LOG_PATH" 2>&1; then
  fallback_open_dmg
  exit 1
fi

xattr -dr com.apple.quarantine "$TARGET_APP" >> "$LOG_PATH" 2>&1 || true
log "Opening updated app: $TARGET_APP"
open "$TARGET_APP" >> "$LOG_PATH" 2>&1 || true
`;
}

function launchMacOSInstaller(installerPath) {
  const targetApp = resolveDesktopInstallDir();
  if (!targetApp || !targetApp.endsWith(".app")) {
    spawn("open", [installerPath], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return { mode: "open-dmg" };
  }

  const workDir = path.dirname(installerPath);
  const scriptPath = path.join(workDir, "install-macos.sh");
  const logPath = path.join(workDir, "install-macos.log");
  fs.writeFileSync(scriptPath, macOSInstallScriptContent(), { mode: 0o700 });
  spawn("sh", [scriptPath, installerPath, targetApp, String(process.pid), logPath], {
    detached: true,
    stdio: "ignore",
  }).unref();
  return { mode: "auto-install", target_app: targetApp, log_path: logPath };
}

function launchInstaller(installerPath) {
  if (process.platform === "win32") {
    spawn(installerPath, installerLaunchArgs(), {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  if (process.platform === "darwin") {
    return launchMacOSInstaller(installerPath);
  }
  throw new Error(`Desktop updates are not supported on ${process.platform}.`);
}

async function downloadAndLaunchDesktopUpdate(options = {}) {
  const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
  const latestTag = await fetchLatestDesktopVersion();
  const fileName = installerFileName();
  const url = installerDownloadUrl(latestTag);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-desktop-update-"));
  const installerPath = path.join(tmpDir, fileName);
  await downloadFile(url, installerPath, undefined, onProgress);
  let verified = false;
  try {
    verified = await verifyInstallerChecksum(installerPath, latestTag);
  } catch (error) {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    throw error;
  }
  const launch = launchInstaller(installerPath) || {};
  return { ok: true, path: installerPath, url, latest_tag: latestTag, checksum_verified: verified, launch };
}

module.exports = {
  compareVersions,
  isNewerVersion,
  normalizeVersion,
  normalizeTag,
  desktopDownloadRoot,
  installerDownloadUrl,
  installerChecksumUrl,
  verifyInstallerChecksum,
  fetchLatestDesktopVersion,
  checkDesktopUpdate,
  downloadFile,
  downloadAndLaunchDesktopUpdate,
  normalizeDownloadProgress,
  resolveDesktopInstallDir,
  installerLaunchArgs,
  macOSInstallScriptContent,
};

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

function downloadFile(url, outPath, timeoutMs = 30 * 60_000) {
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
          downloadFile(new URL(response.headers.location, requestUrl).toString(), outPath, timeoutMs)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode || 0} downloading ${url}`));
          return;
        }
        const file = fs.createWriteStream(outPath);
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(outPath));
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

function launchInstaller(installerPath) {
  if (process.platform === "win32") {
    spawn(installerPath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [installerPath], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  throw new Error(`Desktop updates are not supported on ${process.platform}.`);
}

async function downloadAndLaunchDesktopUpdate() {
  const latestTag = await fetchLatestDesktopVersion();
  const fileName = installerFileName();
  const url = installerDownloadUrl(latestTag);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-desktop-update-"));
  const installerPath = path.join(tmpDir, fileName);
  await downloadFile(url, installerPath);
  let verified = false;
  try {
    verified = await verifyInstallerChecksum(installerPath, latestTag);
  } catch (error) {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    throw error;
  }
  launchInstaller(installerPath);
  return { ok: true, path: installerPath, url, latest_tag: latestTag, checksum_verified: verified };
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
  downloadAndLaunchDesktopUpdate,
};

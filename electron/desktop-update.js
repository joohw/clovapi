const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");

const DEFAULT_DOWNLOAD_BASE = "https://downloads.clovapi.com/desktop/latest";
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

function downloadBaseUrl() {
  return String(process.env.CLOVAPI_DESKTOP_DOWNLOAD_BASE || DEFAULT_DOWNLOAD_BASE).replace(/\/+$/, "");
}

function installerFileName(platform = process.platform) {
  const name = INSTALLER_BY_PLATFORM[platform];
  if (!name) {
    throw new Error(`Desktop updates are not supported on ${platform}.`);
  }
  return name;
}

function installerDownloadUrl(platform = process.platform) {
  return `${downloadBaseUrl()}/${installerFileName(platform)}`;
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
    download_url: upToDate ? "" : installerDownloadUrl(),
    installer_name: installerFileName(),
  };
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
  const fileName = installerFileName();
  const url = installerDownloadUrl();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-desktop-update-"));
  const installerPath = path.join(tmpDir, fileName);
  await downloadFile(url, installerPath);
  launchInstaller(installerPath);
  return { ok: true, path: installerPath, url };
}

module.exports = {
  compareVersions,
  isNewerVersion,
  normalizeVersion,
  installerDownloadUrl,
  fetchLatestDesktopVersion,
  checkDesktopUpdate,
  downloadAndLaunchDesktopUpdate,
};

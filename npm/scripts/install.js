const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const AdmZip = require("adm-zip");
const tar = require("tar");

const pkg = require("../package.json");
const {
  cliBinDir,
  cliBinPath,
  cliInstallLockPath,
  cliVersionMetaPath,
  exeName,
  vendorBinPath,
} = require("./paths");
const { installBinaryWindows } = require("./win-replace");

const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

const ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

function fail(message) {
  console.error(`[clovapi install] ${message}`);
  process.exit(1);
}

function getReleaseCoordinates() {
  const osName = PLATFORM_MAP[process.platform];
  if (!osName) {
    fail(`unsupported platform: ${process.platform}`);
  }

  const archName = ARCH_MAP[process.arch];
  if (!archName) {
    fail(`unsupported arch: ${process.arch}`);
  }

  const versionTag = `v${pkg.version}`;
  const artifactVersion = pkg.version;
  const ext = osName === "windows" ? "zip" : "tar.gz";
  const archiveName = `clovapi_${artifactVersion}_${osName}_${archName}.${ext}`;

  return {
    osName,
    archName,
    versionTag,
    archiveName,
  };
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed ${response.status} for ${url}`);
  }
  const arr = await response.arrayBuffer();
  return Buffer.from(arr);
}

function trimTrailingSlash(input) {
  return String(input || "").replace(/\/+$/, "");
}

function buildBaseUrlCandidates(versionTag) {
  if (process.env.CLOVAPI_CLI_BASE_URL) {
    return [trimTrailingSlash(process.env.CLOVAPI_CLI_BASE_URL)];
  }

  const bases = [];
  const r2Base = trimTrailingSlash(
    process.env.CLOVAPI_R2_BASE_URL || `https://downloads.clovapi.com/clovapi/${versionTag}`
  );
  if (r2Base) bases.push(r2Base);
  bases.push(`https://github.com/joohw/clovapi/releases/download/${versionTag}`);
  return bases;
}

function parseChecksum(checksumContent, fileName) {
  const line = checksumContent
    .split(/\r?\n/)
    .map((v) => v.trim())
    .find((v) => v.endsWith(` ${fileName}`));

  if (!line) {
    throw new Error(`checksum not found for ${fileName}`);
  }

  return line.split(/\s+/)[0];
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function extractArchive(archivePath, archiveName, outDir) {
  if (archiveName.endsWith(".zip")) {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(outDir, true);
    return;
  }

  if (archiveName.endsWith(".tar.gz")) {
    await tar.x({
      file: archivePath,
      cwd: outDir,
      gzip: true,
    });
    return;
  }

  throw new Error(`unsupported archive format: ${archiveName}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withInstallLock(fn) {
  fs.mkdirSync(cliBinDir(), { recursive: true });
  const lockPath = cliInstallLockPath();
  let fd = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        await sleep(100);
        continue;
      }
      throw error;
    }
  }
  if (fd == null) {
    throw new Error(`timed out waiting for install lock: ${lockPath}`);
  }
  try {
    return await fn();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Best-effort cleanup; a future install will retry until the file disappears.
    }
  }
}

function installBinary(sourcePath, targetPath) {
  if (process.platform === "win32") {
    installBinaryWindows(sourcePath, targetPath);
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = path.join(path.dirname(targetPath), `.clovapi-install-${process.pid}-${Date.now()}`);
  fs.copyFileSync(sourcePath, tmpPath);
  fs.chmodSync(tmpPath, 0o755);
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch {
    try {
      fs.rmSync(targetPath, { force: true });
      fs.renameSync(tmpPath, targetPath);
    } catch (retryError) {
      fs.rmSync(tmpPath, { force: true });
      throw retryError;
    }
  }
}

function writeVersionMeta(version) {
  fs.writeFileSync(cliVersionMetaPath(), `${String(version || "").trim()}\n`, { mode: 0o600 });
}

async function installLocalVendorIfPresent() {
  const localBinary = vendorBinPath();
  if (!fs.existsSync(localBinary)) {
    return false;
  }
  await withInstallLock(async () => {
    installBinary(localBinary, cliBinPath());
    writeVersionMeta(pkg.version);
  });
  console.log(`[clovapi install] installed ${cliBinPath()} from local package binary`);
  return true;
}

async function main() {
  if (await installLocalVendorIfPresent()) {
    return;
  }

  const { versionTag, archiveName } = getReleaseCoordinates();
  const baseCandidates = buildBaseUrlCandidates(versionTag);
  let checksumBuffer = null;
  let archiveBuffer = null;
  let usedBaseUrl = "";
  let lastError = null;

  for (const baseUrl of baseCandidates) {
    const checksumUrl = `${baseUrl}/checksums.txt`;
    const archiveUrl = `${baseUrl}/${archiveName}`;
    try {
      console.log(`[clovapi install] trying ${baseUrl}`);
      [checksumBuffer, archiveBuffer] = await Promise.all([
        download(checksumUrl),
        download(archiveUrl),
      ]);
      const expected = parseChecksum(checksumBuffer.toString("utf8"), archiveName);
      const actual = sha256(archiveBuffer);
      if (expected !== actual) {
        throw new Error(`checksum mismatch for ${archiveName}`);
      }
      usedBaseUrl = baseUrl;
      break;
    } catch (error) {
      lastError = error;
      console.warn(`[clovapi install] source failed: ${baseUrl}`);
    }
  }

  if (!checksumBuffer || !archiveBuffer) {
    throw new Error(`all sources failed: ${lastError ? lastError.message : "unknown error"}`);
  }

  console.log(`[clovapi install] downloading ${archiveName} from ${usedBaseUrl}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-install-"));
  const archivePath = path.join(tmpDir, archiveName);
  fs.writeFileSync(archivePath, archiveBuffer);

  const extractDir = path.join(tmpDir, "extract");
  fs.mkdirSync(extractDir, { recursive: true });
  await extractArchive(archivePath, archiveName, extractDir);

  const extractedBinaryPath = path.join(extractDir, exeName());
  if (!fs.existsSync(extractedBinaryPath)) {
    throw new Error(`binary not found after extraction: ${exeName()}`);
  }

  await withInstallLock(async () => {
    installBinary(extractedBinaryPath, cliBinPath());
    writeVersionMeta(pkg.version);

    // Keep a package-local fallback for offline or manually copied npm installs.
    installBinary(extractedBinaryPath, vendorBinPath());
  });

  console.log(`[clovapi install] installed ${cliBinPath()}`);
}

main().catch((err) => {
  fail(err.message);
});

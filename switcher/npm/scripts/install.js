const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const AdmZip = require("adm-zip");
const tar = require("tar");

const pkg = require("../package.json");

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
  const ext = osName === "windows" ? "zip" : "tar.gz";
  const archiveName = `clovapi_${versionTag}_${osName}_${archName}.${ext}`;

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

async function main() {
  const { versionTag, archiveName } = getReleaseCoordinates();
  const baseUrl =
    process.env.CLOVAPI_CLI_BASE_URL ||
    `https://github.com/joohw/new-api/releases/download/${versionTag}`;

  const checksumUrl = `${baseUrl}/checksums.txt`;
  const archiveUrl = `${baseUrl}/${archiveName}`;

  console.log(`[clovapi install] downloading ${archiveName}`);

  const [checksumBuffer, archiveBuffer] = await Promise.all([
    download(checksumUrl),
    download(archiveUrl),
  ]);

  const expected = parseChecksum(checksumBuffer.toString("utf8"), archiveName);
  const actual = sha256(archiveBuffer);
  if (expected !== actual) {
    throw new Error(`checksum mismatch for ${archiveName}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-install-"));
  const archivePath = path.join(tmpDir, archiveName);
  fs.writeFileSync(archivePath, archiveBuffer);

  const vendorDir = path.join(__dirname, "..", "vendor");
  fs.mkdirSync(vendorDir, { recursive: true });

  await extractArchive(archivePath, archiveName, vendorDir);

  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const binaryPath = path.join(vendorDir, exeName);
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`binary not found after extraction: ${exeName}`);
  }

  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log("[clovapi install] install complete");
}

main().catch((err) => {
  fail(err.message);
});

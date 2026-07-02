const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  compareVersions,
  downloadFile,
  installerDownloadUrl,
  isNewerVersion,
  macOSInstallScriptContent,
  normalizeVersion,
} = require("./desktop-update");

test("normalizeVersion strips leading v", () => {
  assert.equal(normalizeVersion("v0.1.3"), "0.1.3");
  assert.equal(normalizeVersion("0.1.3"), "0.1.3");
});

test("compareVersions orders semver parts", () => {
  assert.equal(compareVersions("0.1.3", "0.1.2"), 1);
  assert.equal(compareVersions("0.1.2", "0.1.3"), -1);
  assert.equal(compareVersions("0.1.2", "0.1.2"), 0);
  assert.equal(compareVersions("1.0.0", "0.9.9"), 1);
});

test("isNewerVersion detects newer desktop releases", () => {
  assert.equal(isNewerVersion("0.1.4", "0.1.3"), true);
  assert.equal(isNewerVersion("0.1.3", "0.1.3"), false);
  assert.equal(isNewerVersion("0.1.2", "0.1.3"), false);
});

test("installerDownloadUrl uses versioned desktop path", () => {
  assert.equal(
    installerDownloadUrl("v0.1.5", "win32"),
    "https://downloads.clovapi.com/desktop/v0.1.5/clovapi-desktop-windows-x64.exe",
  );
  assert.equal(
    installerDownloadUrl("0.1.5", "darwin"),
    "https://downloads.clovapi.com/desktop/v0.1.5/clovapi-desktop-darwin-universal.dmg",
  );
});

test("installerLaunchArgs uses NSIS silent flags on Windows", () => {
  const { installerLaunchArgs } = require("./desktop-update");
  if (process.platform !== "win32") {
    assert.deepEqual(installerLaunchArgs("C:\\Apps\\Clov API代理"), []);
    return;
  }
  assert.deepEqual(installerLaunchArgs("C:\\Apps\\Clov API代理"), [
    "/S",
    "/D=C:\\Apps\\Clov API代理",
  ]);
  assert.deepEqual(installerLaunchArgs(""), ["/S"]);
});

test("macOS installer script mounts DMG, replaces app, and reopens it", () => {
  const script = macOSInstallScriptContent();
  assert.match(script, /hdiutil attach "\$DMG_PATH"/);
  assert.match(script, /find "\$MOUNT_DIR" .* -name "\*\.app"/);
  assert.match(script, /ditto "\$SOURCE_APP" "\$STAGING_APP"/);
  assert.match(script, /rm -rf "\$TARGET_APP"/);
  assert.match(script, /mv "\$STAGING_APP" "\$TARGET_APP"/);
  assert.match(script, /open "\$TARGET_APP"/);
  assert.match(script, /fallback_open_dmg/);
});

test("downloadFile emits byte progress", async () => {
  const body = Buffer.from("clovapi update progress");
  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      "Content-Length": body.length,
      "Content-Type": "application/octet-stream",
    });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clovapi-update-test-"));
  const outPath = path.join(tmpDir, "installer.bin");
  const progress = [];

  try {
    await downloadFile(`http://127.0.0.1:${address.port}/installer.bin`, outPath, 5_000, (entry) => {
      progress.push(entry);
    });
    assert.deepEqual(await fs.readFile(outPath), body);
    assert.equal(progress.at(-1)?.percent, 100);
    assert.equal(progress.at(-1)?.received_bytes, body.length);
    assert.equal(progress.at(-1)?.total_bytes, body.length);
  } finally {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

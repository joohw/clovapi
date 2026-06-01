const assert = require("node:assert/strict");
const test = require("node:test");

const {
  compareVersions,
  installerDownloadUrl,
  isNewerVersion,
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
    assert.deepEqual(installerLaunchArgs("C:\\Apps\\ClovAPI Switcher"), []);
    return;
  }
  assert.deepEqual(installerLaunchArgs("C:\\Apps\\ClovAPI Switcher"), [
    "/S",
    "/D=C:\\Apps\\ClovAPI Switcher",
  ]);
  assert.deepEqual(installerLaunchArgs(""), ["/S"]);
});

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

test("canonical CLI paths live under the clovapi config bin dir", () => {
  const previousAppData = process.env.APPDATA;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  if (process.platform === "win32") {
    process.env.APPDATA = path.join("tmp", "appdata");
  } else {
    process.env.XDG_CONFIG_HOME = path.join("tmp", "xdg-config");
  }
  delete require.cache[require.resolve("./paths")];
  const paths = require("./paths");
  const expectedConfigDir =
    process.platform === "win32"
      ? path.join("tmp", "appdata", "clovapi")
      : path.join("tmp", "xdg-config", "clovapi");

  try {
    assert.equal(paths.cliBinDir(), path.join(expectedConfigDir, "bin"));
    assert.equal(paths.cliBinPath(), path.join(expectedConfigDir, "bin", paths.exeName()));
    assert.equal(paths.cliVersionMetaPath(), path.join(expectedConfigDir, "bin", "version.txt"));
    assert.equal(paths.cliInstallLockPath(), path.join(expectedConfigDir, "bin", ".install.lock"));
  } finally {
    if (previousAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = previousAppData;
    }
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
    delete require.cache[require.resolve("./paths")];
  }
});

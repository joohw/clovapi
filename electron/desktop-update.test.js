const assert = require("node:assert/strict");
const test = require("node:test");

const { compareVersions, isNewerVersion, normalizeVersion } = require("./desktop-update");

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

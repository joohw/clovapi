const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildPathBlock,
  ensureCliBinOnPath,
  upsertMarkedBlock,
} = require("./cli-path-register");
const { cliBinPath } = require("./config-paths");

function withTempConfigHome(t) {
  const previous = process.env.XDG_CONFIG_HOME;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-path-register-"));
  process.env.XDG_CONFIG_HOME = root;
  t.after(() => {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test("buildPathBlock includes managed markers", () => {
  const block = buildPathBlock("/tmp/clovapi/bin");
  assert.match(block, /# >>> clovapi >>>/);
  assert.match(block, /export PATH="\/tmp\/clovapi\/bin:\$PATH"/);
  assert.match(block, /# <<< clovapi <<</);
});

test("upsertMarkedBlock replaces an existing block", () => {
  const original = ["before", buildPathBlock("/old/bin"), "after"].join("\n");
  const next = upsertMarkedBlock(original, buildPathBlock("/new/bin"));
  assert.match(next, /\/new\/bin:\$PATH/);
  assert.doesNotMatch(next, /\/old\/bin:\$PATH/);
  assert.match(next, /before/);
  assert.match(next, /after/);
});

test("ensureCliBinOnPath appends once to the selected shell profile", (t) => {
  if (process.platform === "win32") {
    t.skip("unix shell profile test");
    return;
  }
  const configRoot = withTempConfigHome(t);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-home-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const binPath = cliBinPath();
  fs.mkdirSync(path.dirname(binPath), { recursive: true });
  fs.writeFileSync(binPath, "cli");

  const profile = path.join(home, ".zprofile");
  fs.writeFileSync(profile, "export FOO=1\n", { mode: 0o600 });

  const first = ensureCliBinOnPath();
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(first.profile, profile);
  assert.match(fs.readFileSync(profile, "utf8"), /\/clovapi\/bin:\$PATH/);

  const second = ensureCliBinOnPath();
  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
  assert.equal(second.already, true);
  assert.equal(fs.readFileSync(profile, "utf8").split("# >>> clovapi >>>").length - 1, 1);

  assert.equal(configRoot.length > 0, true);
});

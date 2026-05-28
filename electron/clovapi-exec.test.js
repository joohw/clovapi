const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { cliBinPath } = require("./config-paths");
const { resolveClovapiExecutable, runClovapiArgsAsync } = require("./clovapi-exec");

function withTempAppData(t) {
  const previousAppData = process.env.APPDATA;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousOverride = process.env.CLOVAPI_ELECTRON_CLI_PATH;
  const previousElectronDev = process.env.ELECTRON_DEV;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-electron-test-"));
  if (process.platform === "win32") {
    process.env.APPDATA = root;
  } else {
    process.env.XDG_CONFIG_HOME = root;
  }
  delete process.env.CLOVAPI_ELECTRON_CLI_PATH;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    if (previousOverride === undefined) delete process.env.CLOVAPI_ELECTRON_CLI_PATH;
    else process.env.CLOVAPI_ELECTRON_CLI_PATH = previousOverride;
    if (previousElectronDev === undefined) delete process.env.ELECTRON_DEV;
    else process.env.ELECTRON_DEV = previousElectronDev;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test("resolveClovapiExecutable falls back to local candidate without writing canonical bin", (t) => {
  const root = withTempAppData(t);
  process.env.ELECTRON_DEV = "1";
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const local = path.join(root, "bundle", exeName);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, "local cli");

  const resolved = resolveClovapiExecutable({ extraCandidates: [local] });
  const canonical = cliBinPath();

  assert.equal(resolved, local);
  assert.equal(fs.existsSync(canonical), false);
});

test("resolveClovapiExecutable prefers existing canonical bin", (t) => {
  const root = withTempAppData(t);
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const canonical = cliBinPath();
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  fs.writeFileSync(canonical, "canonical cli");

  const resolved = resolveClovapiExecutable();

  assert.equal(resolved, canonical);
  assert.equal(fs.readFileSync(canonical, "utf8"), "canonical cli");
});

test("resolveClovapiExecutable prefers development candidates in dev mode", (t) => {
  const root = withTempAppData(t);
  process.env.ELECTRON_DEV = "1";
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const canonical = cliBinPath();
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  fs.writeFileSync(canonical, "canonical cli");

  const devCli = path.join(root, "dev", exeName);
  fs.mkdirSync(path.dirname(devCli), { recursive: true });
  fs.writeFileSync(devCli, "dev cli");

  const resolved = resolveClovapiExecutable({ extraCandidates: [devCli] });

  assert.notEqual(resolved, canonical);
  assert.equal(fs.readFileSync(canonical, "utf8"), "canonical cli");
});

test("runClovapiArgsAsync captures output without spawnSync", async (t) => {
  const root = withTempAppData(t);
  process.env.ELECTRON_DEV = "1";
  const exeName = process.platform === "win32" ? "clovapi.cmd" : "clovapi";
  const exe = path.join(root, exeName);
  if (process.platform === "win32") {
    fs.writeFileSync(exe, "@echo off\r\necho async:%1\r\n", "utf8");
  } else {
    fs.writeFileSync(exe, "#!/bin/sh\necho async:$1\n", "utf8");
    fs.chmodSync(exe, 0o755);
  }
  process.env.CLOVAPI_ELECTRON_CLI_PATH = exe;

  const result = await runClovapiArgsAsync(["probe"], { timeout: 5000 });

  assert.equal(result.ok, true);
  assert.equal(result.stdout.trim(), "async:probe");
});

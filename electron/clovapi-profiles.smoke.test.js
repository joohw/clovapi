const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  loadProfiles,
  saveProfiles,
  switchProviderModel,
  modelAdapters,
} = require("./clovapi-desktop");

function withIsolatedConfig(t) {
  const previousAppData = process.env.APPDATA;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousCliPath = process.env.CLOVAPI_ELECTRON_CLI_PATH;
  const previousElectronDev = process.env.ELECTRON_DEV;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clovapi-profiles-smoke-"));
  if (process.platform === "win32") {
    process.env.APPDATA = root;
  } else {
    process.env.XDG_CONFIG_HOME = root;
  }
  process.env.ELECTRON_DEV = "1";

  const coreCmdDir = path.join(__dirname, "..", "core", "cmd");
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  const built = path.join(root, exeName);
  const build = spawnSync("go", ["build", "-o", built, "."], {
    cwd: coreCmdDir,
    encoding: "utf8",
    timeout: 120000,
  });
  if (build.error || build.status !== 0) {
    t.skip(`go build clovapi failed: ${build.stderr || build.error || build.status}`);
  }
  process.env.CLOVAPI_ELECTRON_CLI_PATH = built;

  t.after(() => {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    if (previousCliPath === undefined) delete process.env.CLOVAPI_ELECTRON_CLI_PATH;
    else process.env.CLOVAPI_ELECTRON_CLI_PATH = previousCliPath;
    if (previousElectronDev === undefined) delete process.env.ELECTRON_DEV;
    else process.env.ELECTRON_DEV = previousElectronDev;
    fs.rmSync(root, { recursive: true, force: true });
  });
}

test("desktop facade loadProfiles hits clovapi profiles load --json", async (t) => {
  withIsolatedConfig(t);
  const result = await loadProfiles();
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.profiles));
});

test("desktop facade saveProfiles roundtrips via clovapi profiles save --json", async (t) => {
  withIsolatedConfig(t);
  const payload = {
    profiles: [
      {
        name: "Custom API",
        kind: "api",
        modelAdapter: "manual",
        baseUrl: "http://127.0.0.1:59999/v1",
        apiKey: "smoke-key",
        models: [
          {
            id: "smoke-model",
            label: "Smoke",
            model: "smoke-model",
            apiStyle: "openai-chat",
          },
        ],
      },
    ],
    active: {
      opencode: { provider_id: "custom-api", model_id: "smoke-model" },
    },
    proxy: { enabled: true, host: "127.0.0.1", port: 27483 },
  };
  const saved = await saveProfiles(payload);
  assert.equal(saved.ok, true);
  const reload = await loadProfiles();
  assert.equal(reload.ok, true);
  assert.equal(reload.active?.opencode?.provider_id, "custom-api");
  assert.equal(reload.active?.opencode?.model_id, "smoke-model");
});

test("desktop facade modelAdapters hits clovapi profiles catalog --json", async (t) => {
  withIsolatedConfig(t);
  const result = await modelAdapters();
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.providers));
});

test("desktop facade switchProviderModel hits clovapi switch --json", async (t) => {
  withIsolatedConfig(t);
  const seed = await saveProfiles({
    profiles: [
      {
        name: "Custom API",
        kind: "api",
        modelAdapter: "manual",
        baseUrl: "http://127.0.0.1:59999/v1",
        apiKey: "smoke-key",
        models: [
          {
            id: "smoke-model",
            label: "Smoke",
            model: "smoke-model",
            apiStyle: "openai-chat",
          },
        ],
      },
    ],
    active: {},
    proxy: { enabled: true, host: "127.0.0.1", port: 27483 },
  });
  assert.equal(seed.ok, true);

  const home = path.join(os.tmpdir(), `clovapi-smoke-home-${process.pid}`);
  fs.mkdirSync(home, { recursive: true });
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  if (process.platform === "win32") process.env.USERPROFILE = home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const switched = await switchProviderModel("opencode", "custom-api", "smoke-model");
  assert.equal(switched.ok, true);
  assert.equal(switched.cli, "opencode");
});

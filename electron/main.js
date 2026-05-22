const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const profileStore = require("./profile-store");
const subscriptionAuth = require("./subscription-auth");
const subscriptionOAuthFlow = require("./subscription-oauth-flow");
const proxyManager = require("./proxy-manager");
const { buildProxyStubProfile } = require("./proxy-resolver");
const modelAdapters = require("./model-adapters");
const { sanitizeForIpc } = require("./ipc-utils");

// Overlay scrollbars float above content instead of reserving layout width (Windows/Linux).
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar,FluentOverlayScrollbar");

let mainWindow = null;
let runningProcess = null;
const THEME_STORAGE_KEY = "clovapi-theme";
/** Matches renderer `--bg-top` (title bar + gradient light end). */
const WINDOW_BG_TOP = "#f8fafc";

function forceLightModeForWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on("did-finish-load", () => {
    void win.webContents.executeJavaScript(
      `(() => {
        try {
          localStorage.setItem("${THEME_STORAGE_KEY}", "light");
          const root = document.documentElement;
          root.classList.remove("dark");
          root.style.colorScheme = "light";
        } catch {}
      })();`,
      true,
    );
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 760,
    minWidth: 640,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BG_TOP,
    title: "ClovAPI Switcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  forceLightModeForWindow(mainWindow);

  const devUrl = process.env.ELECTRON_DEV === "1" ? process.env.VITE_DEV_SERVER_URL || "http://localhost:5173" : "";
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "ui-dist", "index.html"));
  }
}

function emitOutput(type, chunk) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("cli:output", {
    type,
    data: String(chunk ?? "")
  });
}

function getBundledCliCandidates() {
  const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  return [
    process.env.CLOVAPI_ELECTRON_CLI_PATH,
    path.join(process.resourcesPath || "", "bin", exeName),
    path.join(app.getAppPath ? app.getAppPath() : "", "bin", exeName),
    path.join(__dirname, "bin", exeName),
    path.join(__dirname, "..", "switcher", exeName),
    path.join(process.cwd(), "switcher", exeName)
  ].filter(Boolean);
}

function resolveBundledCliPath() {
  for (const candidate of getBundledCliCandidates()) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return "";
}

async function resolveClovapiExecutable() {
  const bundled = resolveBundledCliPath();
  if (bundled) return bundled;
  const system = await resolveCommandPath("clovapi");
  return system.exists ? system.path : "";
}

function startChildProcess(command, options = {}) {
  const { cwd = process.cwd(), env = process.env, executable, args = [] } = options;

  const child =
    executable && Array.isArray(args)
      ? spawn(executable, args, { cwd, windowsHide: true, env })
      : spawn(command, { cwd, shell: true, windowsHide: true, env });

  runningProcess = child;
  emitOutput("system", executable ? `$ ${executable} ${args.join(" ")}\n` : `$ ${command}\n`);
  child.stdout.on("data", (chunk) => emitOutput("stdout", chunk));
  child.stderr.on("data", (chunk) => emitOutput("stderr", chunk));
  child.on("error", (error) => {
    emitOutput("stderr", `${error.message}\n`);
  });
  child.on("close", (code, signal) => {
    emitOutput("system", `\n[exit] code=${String(code)} signal=${String(signal)}\n`);
    runningProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cli:exit", { code, signal });
    }
  });
  return child;
}

function resolveCommandPath(command) {
  const resolver = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(resolver, [command], { shell: true, windowsHide: true });
    const chunks = [];
    const errChunks = [];
    child.stdout.on("data", (chunk) => chunks.push(String(chunk || "")));
    child.stderr.on("data", (chunk) => errChunks.push(String(chunk || "")));
    child.on("close", (code) => {
      const out = chunks.join("").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "";
      const err = errChunks.join("").trim();
      resolve({ ok: code === 0, exists: code === 0, path: out, error: code === 0 ? "" : err || `Command not found: ${command}` });
    });
    child.on("error", (error) => {
      resolve({ ok: false, exists: false, path: "", error: error.message || "Resolve command failed" });
    });
  });
}

function stopRunningProcess() {
  if (!runningProcess) {
    return { ok: false, error: "No command is running." };
  }

  const pid = runningProcess.pid;
  const processRef = runningProcess;

  try {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true
      });
      killer.on("error", () => {
        try {
          processRef.kill();
        } catch {}
      });
    } else {
      processRef.kill("SIGTERM");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to stop process." };
  }
}

ipcMain.handle("cli:run", async (_event, payload) => {
  if (runningProcess) {
    return { ok: false, error: "A command is already running." };
  }

  const command = String(payload?.command || "").trim();
  const cwdInput = String(payload?.cwd || "").trim();
  const cwd = cwdInput || process.cwd();
  const envInput = payload?.env && typeof payload.env === "object" ? payload.env : {};
  const mergedEnv = { ...process.env };
  for (const [key, value] of Object.entries(envInput)) {
    if (!key) continue;
    if (value === undefined || value === null || value === "") continue;
    mergedEnv[String(key)] = String(value);
  }

  if (!command) {
    return { ok: false, error: "Command cannot be empty." };
  }

  try {
    startChildProcess(command, { cwd, env: mergedEnv });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start command."
    };
  }
});

ipcMain.handle("cli:run-clovapi", async (_event, payload) => {
  if (runningProcess) {
    return { ok: false, error: "A command is already running." };
  }
  const executable = await resolveClovapiExecutable();
  if (!executable) {
    return { ok: false, error: "clovapi executable not found (install CLI or bundle bin/clovapi)" };
  }
  const args = Array.isArray(payload?.args) ? payload.args.map((a) => String(a)) : [];
  const cwdInput = String(payload?.cwd || "").trim();
  const cwd = cwdInput || process.cwd();
  try {
    startChildProcess("", { cwd, env: process.env, executable, args });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start clovapi."
    };
  }
});

function storeToPayload(store) {
  return {
    version: store.version,
    active: store.active,
    proxy: store.proxy || profileStore.defaultProxyConfig(),
    profiles: store.profiles.map((p) => profileStore.toVendor(p)),
  };
}

ipcMain.handle("profiles:load", async () => {
  try {
    let store = await profileStore.loadStore();
    if (
      profileStore.ensureDefaultOllamaProfile(store) ||
      profileStore.ensureDefaultSubscriptionVendors(store)
    ) {
      store = await profileStore.saveStore(store);
    }
    return {
      ok: true,
      path: profileStore.profilesPath(),
      ...storeToPayload(store),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load profiles.json"
    };
  }
});

ipcMain.handle("profiles:save", async (_event, payload) => {
  try {
    const current = await profileStore.loadStore();
    const profilesIn = Array.isArray(payload?.profiles) ? payload.profiles : [];
    const incoming = profilesIn
      .map((p) => profileStore.toStoreProfile(p))
      .filter((p) => profileStore.providerRegistry.isAllowedStoreProfile(p));
    const incomingNames = new Set(incoming.map((p) => String(p.name || "").toLowerCase()));
    const preservedInternal = current.profiles.filter((p) => {
      const name = String(p.name || "");
      return name.startsWith("__") && !incomingNames.has(name.toLowerCase());
    });
    current.profiles = [...incoming, ...preservedInternal];
    if (payload?.active && typeof payload.active === "object") {
      current.active = { ...payload.active };
    }
    if (payload?.proxy && typeof payload.proxy === "object") {
      current.proxy = {
        ...(current.proxy || profileStore.defaultProxyConfig()),
        ...payload.proxy,
      };
    }
    profileStore.ensureDefaultOllamaProfile(current);
    const saved = await profileStore.saveStore(current);
    return { ok: true, path: profileStore.profilesPath(), ...storeToPayload(saved) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save profiles.json"
    };
  }
});

ipcMain.handle("profiles:list-models", async (_event, payload) => {
  try {
    const vendorName = String(payload?.vendorName || "").trim();
    if (!vendorName) {
      return { ok: false, error: "vendorName is required" };
    }
    let store = await profileStore.loadStore();
    profileStore.ensureDefaultOllamaProfile(store);
    profileStore.ensureDefaultSubscriptionVendors(store);
    const vendor = profileStore.findStoreVendorProfile(store, vendorName);
    if (!vendor) {
      return { ok: false, error: `未找到供应商: ${vendorName}` };
    }
    const vendorIdx = store.profiles.findIndex((p) => p === vendor);
    const result = await modelAdapters.listVendorModels(vendor);
    const fetched = result.models || [];
    if (!fetched.length) {
      return {
        ok: false,
        error: result.message || "未拉取到任何模型",
      };
    }
    const mergedModels = result.replaceModels
      ? fetched
      : profileStore.mergeVendorModels(vendor.models, fetched);
    const updatedVendor = { ...vendor, models: mergedModels };
    if (vendorIdx >= 0) {
      store.profiles[vendorIdx] = updatedVendor;
    } else {
      store.profiles.push(updatedVendor);
    }
    store = await profileStore.saveStore(store);
    const savedVendor = profileStore.findStoreVendorProfile(store, vendorName);
    return {
      ok: true,
      adapterId: result.adapterId,
      models: (savedVendor?.models || []).map((m) => ({
        id: m.id,
        label: m.label,
        model: m.model,
        apiStyle: m.api_style,
      })),
      source: result.source || "",
      message: result.message || "",
      profiles: storeToPayload(store).profiles,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to list vendor models",
    };
  }
});

ipcMain.handle("profiles:model-adapters", async () => {
  return {
    ok: true,
    adapters: modelAdapters.ADAPTER_CATALOG,
  };
});

ipcMain.handle("profiles:test", async (_event, payload) => {
  try {
    const binding = String(payload?.binding || "").trim();
    if (!binding) {
      return {
        ok: false,
        passed: false,
        summary: "测试失败",
        error: "未指定测试目标",
        text: "未指定要测试的模型绑定（@model:供应商/模型）。",
      };
    }

    let store;
    if (Array.isArray(payload?.vendors) && payload.vendors.length) {
      store = profileStore.storeFromUiVendors(payload.vendors, payload?.active, payload?.proxy);
    } else {
      store = await profileStore.loadStore();
      profileStore.ensureDefaultOllamaProfile(store);
      profileStore.ensureDefaultSubscriptionVendors(store);
    }

    const parsed = profileStore.parseModelBinding(binding);
    const hit = parsed
      ? profileStore.findVendorModel(store, parsed.vendorName, parsed.modelId)
      : null;
    if (!hit) {
      return {
        ok: false,
        passed: false,
        summary: "测试失败",
        error: `未找到模型: ${binding}`,
        text: `未在供应商配置中找到该模型（${binding}）。请先拉取或添加模型；无需在「客户端管理」中绑定即可测试。`,
      };
    }

    const result = await modelAdapters.testVendorModel(hit.vendor, hit.model, {
      buildSubscriptionProfile: (providerId) =>
        subscriptionAuth.buildSubscriptionProfile(providerId, "opencode"),
    });
    return sanitizeForIpc({
      ok: true,
      passed: Boolean(result.ok),
      summary: String(result.summary || (result.ok ? "测试成功" : "测试失败")),
      text: String(result.text || ""),
      error: result.error ? String(result.error) : "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "API 测试失败";
    const stack = error instanceof Error ? error.stack : "";
    return {
      ok: false,
      passed: false,
      error: message,
      summary: "测试失败",
      text: ["=== 测试过程异常 ===", "", message, stack ? `\n${stack}` : ""].join("\n"),
    };
  }
});

ipcMain.handle("cli:stop", async () => {
  return stopRunningProcess();
});

ipcMain.handle("cli:state", async () => {
  return { running: Boolean(runningProcess) };
});

ipcMain.handle("cli:default-cwd", async () => {
  return { cwd: process.cwd() };
});

ipcMain.handle("cli:which", async (_event, payload) => {
  const command = String(payload?.command || "").trim();
  if (!command) return { ok: false, exists: false, path: "" };
  return resolveCommandPath(command);
});

/** providerId -> AbortController (each subscription login is independent). */
const activeSubscriptionLogins = new Map();

async function runSubscriptionLogin(providerId) {
  const cfg = subscriptionAuth.getProviderConfig(providerId);
  if (!cfg) {
    return { ok: false, error: `未知订阅类型: ${providerId}` };
  }
  if (activeSubscriptionLogins.has(providerId)) {
    return { ok: false, error: "该订阅正在登录中" };
  }

  const abort = new AbortController();
  activeSubscriptionLogins.set(providerId, abort);

  try {
    return await subscriptionOAuthFlow.runSubscriptionLogin(providerId, {
      signal: abort.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = error?.code === "LOGIN_CANCELLED" || abort.signal.aborted;
    return {
      ok: false,
      cancelled,
      error: message || "登录失败",
    };
  } finally {
    activeSubscriptionLogins.delete(providerId);
  }
}

ipcMain.handle("subscription:status", async () => {
  try {
    await subscriptionAuth.refreshClaudeSubscriptionMetadata();
    const items = [];
    for (const id of subscriptionAuth.listProviderIds()) {
      const cfg = subscriptionAuth.getProviderConfig(id);
      const cmd = await resolveCommandPath(cfg.command);
      items.push(subscriptionAuth.getProviderStatus(id, cmd));
    }
    return { ok: true, items };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read subscription status",
    };
  }
});

ipcMain.handle("subscription:login", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  return runSubscriptionLogin(provider);
});

ipcMain.handle("subscription:login-cancel", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  const abort = activeSubscriptionLogins.get(provider);
  if (!abort) {
    return { ok: false, error: "该订阅未在登录中" };
  }
  abort.abort();
  return { ok: true };
});

ipcMain.handle("subscription:claude-profile", async (_event, payload) => {
  const targetCli = String(payload?.targetCli || "kimi-code").trim();
  return subscriptionAuth.buildClaudeSubscriptionProfile(targetCli);
});

ipcMain.handle("subscription:build-profile", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  const targetCli = String(payload?.targetCli || "").trim();
  return subscriptionAuth.buildSubscriptionProfile(provider, targetCli);
});

ipcMain.handle("subscription:logout", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  const cfg = subscriptionAuth.getProviderConfig(provider);
  if (!cfg) {
    return { ok: false, error: `未知订阅类型: ${provider}` };
  }
  return subscriptionAuth.removeAuthFile(provider);
});

ipcMain.handle("proxy:status", async () => {
  try {
    const cfg = await proxyManager.loadProxyConfig();
    return { ok: true, ...proxyManager.status(), config: cfg };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read proxy status",
    };
  }
});

ipcMain.handle("proxy:start", async (_event, payload) => {
  try {
    const port = Number(payload?.port) || undefined;
    return await proxyManager.start({ port });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start proxy",
    };
  }
});

ipcMain.handle("proxy:stop", async () => {
  try {
    return await proxyManager.stop();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to stop proxy",
    };
  }
});

ipcMain.handle("proxy:ensure-stub", async (_event, payload) => {
  try {
    const cliKind = String(payload?.cliKind || "").trim();
    const binding = String(payload?.binding || "").trim();
    if (!cliKind) {
      return { ok: false, error: "cliKind is required" };
    }
    const ensured = await proxyManager.ensureRunning();
    if (!ensured.ok) {
      return ensured;
    }
    const store = await profileStore.loadStore();
    const stub = buildProxyStubProfile(cliKind, ensured.port, binding, store);
    profileStore.upsertProfile(store, stub);
    await profileStore.saveStore(store);
    return { ok: true, stubName: stub.name, port: ensured.port, apiStyle };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to upsert proxy stub profile",
    };
  }
});

ipcMain.handle("cli:tool-status", async () => {
  const bundledPath = resolveBundledCliPath();
  if (bundledPath) {
    return { ok: true, available: true, source: "bundled", path: bundledPath };
  }
  const system = await resolveCommandPath("clovapi");
  if (system.exists) {
    return { ok: true, available: true, source: "system", path: system.path };
  }
  return { ok: false, available: false, source: "none", path: "", error: "No bundled or system clovapi found" };
});

app.whenReady().then(async () => {
  nativeTheme.themeSource = "light";
  createWindow();
  try {
    const cfg = await proxyManager.loadProxyConfig();
    await proxyManager.start({ port: cfg.port });
  } catch {
    // Non-fatal on startup
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopRunningProcess();
  void proxyManager.stop();
  if (process.platform !== "darwin") app.quit();
});

const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createGoProxyManager } = require("./proxy-manager");
const proxyLogger = require("./proxy-logger");
const callLogsStore = require("./call-logs-store");
const clovapiDesktop = require("./clovapi-desktop");
const { buildBundledCandidates, resolveClovapiExecutable: resolveBundledClovapiExecutable } = require("./clovapi-exec");
const subscriptionAuth = require("./subscription-auth");
const subscriptionOAuthFlow = require("./subscription-oauth-flow");
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
  return buildBundledCandidates([
    process.env.CLOVAPI_ELECTRON_CLI_PATH,
    path.join(process.resourcesPath || "", "bin", exeName),
    path.join(app.getAppPath ? app.getAppPath() : "", "bin", exeName),
  ]);
}

function resolveBundledCliPath() {
  return resolveBundledClovapiExecutable({ extraCandidates: getBundledCliCandidates() });
}

async function resolveClovapiExecutable() {
  const system = await resolveCommandPath("clovapi");
  if (system.exists) return system.path;
  return resolveBundledCliPath();
}

const proxyManager = createGoProxyManager({ resolveExecutable: resolveClovapiExecutable });

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

/** Spawn clovapi (or any executable) and resolve when the child exits. */
function spawnExecutableAndWait(executable, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningProcess = child;
    const cmdLine = `$ ${executable} ${args.join(" ")}`;
    emitOutput("system", `${cmdLine}\n`);
    child.stdout.on("data", (chunk) => emitOutput("stdout", chunk));
    child.stderr.on("data", (chunk) => emitOutput("stderr", chunk));
    child.on("error", (error) => {
      const message = error.message || "Failed to start clovapi.";
      emitOutput("stderr", `${message}\n`);
      runningProcess = null;
      resolve({ ok: false, error: message });
    });
    child.on("close", (code, signal) => {
      const exitLine = `[exit] code=${String(code)} signal=${String(signal)}`;
      emitOutput("system", `\n${exitLine}\n`);
      runningProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("cli:exit", { code, signal });
      }
      resolve({ ok: true, code, signal });
    });
  });
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
    const result = await spawnExecutableAndWait(executable, args, cwd);
    if (!result.ok) {
      return { ok: false, error: result.error || "Failed to start clovapi." };
    }
    return { ok: true, code: result.code ?? null, signal: result.signal ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start clovapi.",
    };
  }
});

ipcMain.handle("profiles:load", async () => {
  try {
    return await clovapiDesktop.loadProfiles();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load profiles.json",
    };
  }
});

ipcMain.handle("profiles:save", async (_event, payload) => {
  try {
    return await clovapiDesktop.saveProfiles(payload);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save profiles.json",
    };
  }
});

ipcMain.handle("profiles:list-models", async (_event, payload) => {
  try {
    const vendorName = String(payload?.vendorName || "").trim();
    if (!vendorName) {
      return { ok: false, error: "vendorName is required" };
    }
    return await clovapiDesktop.listVendorModels(vendorName);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to list vendor models",
    };
  }
});

ipcMain.handle("profiles:model-adapters", async () => {
  try {
    return await clovapiDesktop.modelAdapters();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to list model adapters",
    };
  }
});

ipcMain.handle("profiles:test", async (_event, payload) => {
  try {
    const ensured = await proxyManager.ensureRunning();
    if (!ensured.ok) {
      return sanitizeForIpc({
        ok: true,
        passed: false,
        summary: "测试失败",
        error: ensured.error || "本地代理未启动",
        text: ensured.error || "无法启动本地代理，测试请求未发出。",
      });
    }
    const body = {
      binding: payload?.binding,
      proxy: {
        port: Number(payload?.proxy?.port) || Number(ensured.port) || 27483,
      },
    };
    return sanitizeForIpc(await clovapiDesktop.testBinding(body));
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
    return await clovapiDesktop.authStatus();
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
  try {
    return await clovapiDesktop.authLogout(provider);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to logout subscription",
    };
  }
});

ipcMain.handle("proxy:status", async () => {
  try {
    const cfg = await proxyManager.loadProxyConfig();
    const status = await proxyManager.status();
    return { ok: true, ...status, config: cfg };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read proxy status",
    };
  }
});

ipcMain.handle("proxy:health", async () => {
  try {
    return await proxyManager.probeHealth();
  } catch (error) {
    return {
      ok: false,
      passed: false,
      error: error instanceof Error ? error.message : "Failed to probe proxy health",
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

ipcMain.handle("proxy-logs:list", async () => {
  let system = [];
  let requests = [];
  try {
    const cfg = await proxyManager.loadProxyConfig();
    const status = await proxyManager.status();
    if (status.running) {
      const host = require("./proxy-manager").healthClientHost(cfg.host);
      const port = Number(cfg.port) || 27483;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2500);
      try {
        const [callRes, systemRes] = await Promise.all([
          fetch(`http://${host}:${port}/__debug/call-log`, { signal: ac.signal }),
          fetch(`http://${host}:${port}/__debug/system-log`, { signal: ac.signal }),
        ]);
        if (callRes.ok) {
          const json = await callRes.json();
          if (Array.isArray(json?.entries)) {
            requests = json.entries;
          }
        }
        if (systemRes.ok) {
          const json = await systemRes.json();
          if (Array.isArray(json?.entries)) {
            system = json.entries;
          }
        }
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    requests = [];
    system = [];
  }
  if (!system.length) {
    system = proxyLogger.listSystem();
  }
  if (!requests.length) {
    try {
      requests = await callLogsStore.readCallLogs(200);
    } catch {
      requests = [];
    }
  }
  return { ok: true, requests, system };
});

ipcMain.handle("proxy-logs:clear", async (_event, payload) => {
  const scope = String(payload?.scope || "all").trim().toLowerCase();
  if (scope === "system" || scope === "all") {
    proxyLogger.clearSystem();
  }
  if (scope === "calls" || scope === "all") {
    try {
      await callLogsStore.clearCallLogsFile();
    } catch {
      /* noop */
    }
    try {
      const cfg = await proxyManager.loadProxyConfig();
      const status = await proxyManager.status();
      if (status.running) {
        const host = require("./proxy-manager").healthClientHost(cfg.host);
        const port = Number(cfg.port) || 27483;
        const url = `http://${host}:${port}/__debug/call-log`;
        await fetch(url, { method: "DELETE" }).catch(() => {});
      }
    } catch {
      /* noop */
    }
  }
  return { ok: true, requests: [], system: [] };
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

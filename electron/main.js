const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createClovapiProxy } = require("./clovapi-proxy");
const callLogsStore = require("./call-logs-store");
const clovapiDesktop = require("./clovapi-desktop");
clovapiDesktop.setOutputHandler((kind, chunk) => emitOutput(kind, chunk));
const { applyTrayModelSwitch } = require("./tray-model-switch");
const {
  coreDevStatePath,
  resolveClovapiExecutableAsync,
} = require("./clovapi-exec");
const { ensureCliBinOnPath, cliSpawnEnv } = require("./cli-path-register");
const { buildTrayMenuModel, isValidTrayTab, trayStatusSummary, trayTooltip } = require("./tray-menu");
const { cliBinPath, electronDevUserDataDir, electronUserDataDir } = require("./config-paths");
const { checkDesktopUpdate, downloadAndLaunchDesktopUpdate } = require("./desktop-update");
const { sanitizeForIpc } = require("./ipc-utils");

const isElectronDev =
  process.env.ELECTRON_DEV === "1" || process.argv.includes("--clovapi-dev");

// Overlay scrollbars float above content instead of reserving layout width (Windows/Linux).
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar,FluentOverlayScrollbar");
app.setName("ClovAPI Switcher");

const electronDataDir = isElectronDev ? electronDevUserDataDir() : electronUserDataDir();
fs.mkdirSync(electronDataDir, { recursive: true });
app.setPath("userData", electronDataDir);

if (isElectronDev) {
  app.commandLine.appendSwitch("disk-cache-dir", path.join(electronDataDir, "cache"));
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
}

const gotSingleInstanceLock = isElectronDev ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let trayContextMenu = null;
let runningProcess = null;
let quitting = false;
const THEME_STORAGE_KEY = "clovapi-theme";
/** Matches renderer page background (title bar flash before paint). */
const WINDOW_BG_TOP = "#FBF9F9";
const TITLE_BAR_OVERLAY_HEIGHT = 32;

function windowTitle() {
  return `ClovAPI Switcher v${app.getVersion()}`;
}

function buildBrowserWindowOptions() {
  const options = {
    width: 720,
    height: 760,
    minWidth: 640,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BG_TOP,
    icon: windowIconPath(),
    title: windowTitle(),
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  if (process.platform === "win32") {
    options.titleBarStyle = "hidden";
    options.titleBarOverlay = {
      color: WINDOW_BG_TOP,
      symbolColor: "#353535",
      height: TITLE_BAR_OVERLAY_HEIGHT,
    };
    options.backgroundMaterial = "none";
  } else if (process.platform === "darwin") {
    options.titleBarStyle = "hiddenInset";
  }

  return options;
}
let coreDevWatcher = null;
let coreDevRestartTimer = null;

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

function windowIconPath() {
  if (process.platform === "win32") {
    return path.join(__dirname, "assets", "icon.ico");
  }
  if (process.platform === "darwin") {
    return path.join(__dirname, "assets", "icon.icns");
  }
  return path.join(__dirname, "assets", "app-icon-1024.png");
}

function trayIconPath() {
  if (process.platform === "win32") {
    return path.join(__dirname, "assets", "icon.ico");
  }
  if (process.platform === "darwin") {
    return path.join(__dirname, "assets", "tray-iconTemplate@2x.png");
  }
  return path.join(__dirname, "assets", "app-icon.iconset", "icon_32x32.png");
}

function createTrayImage() {
  const img = nativeImage.createFromPath(trayIconPath());
  if (img.isEmpty()) {
    return nativeImage.createFromPath(windowIconPath());
  }
  if (process.platform === "darwin") {
    img.setTemplateImage(true);
    return img;
  }
  return img.resize({ width: 18, height: 18 });
}

function dispatchRendererEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("app:event", payload);
}

function showMainWindow(options = {}) {
  const tab = isValidTrayTab(options?.tab) ? options.tab : null;
  const vendorName = String(options?.vendorName || "").trim();
  const eventPayload =
    options?.eventPayload && typeof options.eventPayload === "object"
      ? options.eventPayload
      : vendorName
        ? { type: "open-profiles-vendor", vendorName }
        : tab
          ? { type: "open-tab", tab }
          : null;
  let created = false;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    created = true;
  }
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  if (process.platform === "darwin") app.dock?.show();
  mainWindow.focus();
  void updateTrayMenu();
  if (!eventPayload) return;
  const sendAppEvent = () => dispatchRendererEvent(eventPayload);
  if (created || mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", sendAppEvent);
    return;
  }
  sendAppEvent();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  void updateTrayMenu();
}

async function readTrayProxyState() {
  try {
    const cfg = await proxyManager.loadProxyConfig();
    const status = await proxyManager.status();
    return {
      ok: true,
      running: Boolean(status?.running),
      managed: Boolean(status?.managed),
      external: Boolean(status?.external),
      port: Number(status?.port) || Number(cfg?.port) || 27483,
      host: String(status?.host || cfg?.host || "127.0.0.1"),
      baseUrl: String(status?.baseUrl || ""),
      error: String(status?.error || ""),
    };
  } catch (error) {
    return {
      ok: false,
      running: false,
      managed: false,
      external: false,
      port: 27483,
      host: "127.0.0.1",
      baseUrl: "",
      error: error instanceof Error ? error.message : "Failed to read proxy status",
    };
  }
}

async function readTrayDesktopState() {
  try {
    const result = await clovapiDesktop.loadProfiles();
    if (!result?.ok) {
      return {
        ok: false,
        profiles: [],
        active: {},
        error: String(result?.error || "").trim(),
      };
    }
    return {
      ok: true,
      profiles: Array.isArray(result?.profiles) ? result.profiles : [],
      active: result?.active && typeof result.active === "object" ? result.active : {},
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      profiles: [],
      active: {},
      error: error instanceof Error ? error.message : "Failed to read desktop profiles",
    };
  }
}

async function readTrayAgentInstallState() {
  try {
    const result = await clovapiDesktop.agentStatus();
    return {
      ok: Boolean(result?.ok),
      agents: Array.isArray(result?.items) ? result.items : [],
      error: String(result?.error || "").trim(),
    };
  } catch (error) {
    return {
      ok: false,
      agents: [],
      error: error instanceof Error ? error.message : "Failed to read agent install status",
    };
  }
}

async function switchTrayAgentModel(cliKind, providerId, modelId) {
  await applyTrayModelSwitch({
    desktop: clovapiDesktop,
    cliKind,
    providerId,
    modelId,
    emitOutput,
    dispatchRendererEvent,
    updateTrayMenu,
  });
}

async function updateTrayMenu() {
  if (!tray) return;
  const [state, desktop, agentsState] = await Promise.all([
    readTrayProxyState(),
    readTrayDesktopState(),
    readTrayAgentInstallState(),
  ]);
  const model = buildTrayMenuModel({
    running: state.running,
    port: state.port,
    external: state.external,
    managed: state.managed,
    error: state.error,
    profiles: desktop.profiles,
    active: desktop.active,
    agents: agentsState.agents,
  });
  tray.setToolTip(trayTooltip(trayStatusSummary(state)));
  const template = [
    {
      label: model.windowLabel,
      click: () => showMainWindow(),
    },
    {
      label: model.profilesLabel,
      click: () => showMainWindow({ tab: "profiles" }),
    },
    {
      label: model.settingsLabel,
      click: () => showMainWindow({ tab: "settings" }),
    },
    {
      label: model.logsLabel,
      click: () => showMainWindow({ tab: "call-logs" }),
    },
    { type: "separator" },
    {
      label: model.statusLabel,
      enabled: false,
    },
    ...(model.hasBindings
      ? model.bindings.map((binding) => ({
          label: binding.summaryLabel,
          submenu: binding.modelOptions.length
            ? [
                { label: binding.detailLabel, enabled: false },
                { type: "separator" },
                ...binding.modelOptions.map((option) => ({
                  label: option.label,
                  type: "checkbox",
                  checked: option.checked,
                  click: () => {
                    void switchTrayAgentModel(binding.cliKind, option.providerId, option.modelId);
                  },
                })),
                { type: "separator" },
                {
                  label: "Open Provider",
                  click: () => showMainWindow({ vendorName: binding.vendorName }),
                },
              ]
            : [
                { label: binding.detailLabel, enabled: false },
                { label: "No compatible models", enabled: false },
                { type: "separator" },
                {
                  label: "Open Provider",
                  click: () => showMainWindow({ vendorName: binding.vendorName }),
                },
              ],
        }))
      : [{ label: model.noAgentsLabel, enabled: false }]),
    ...(model.canStartProxy
      ? [
          {
            label: model.startProxyLabel,
            enabled: true,
            click: async () => {
              await proxyManager.start();
              dispatchRendererEvent({ type: "proxy-status-changed" });
              await updateTrayMenu();
            },
          },
        ]
      : []),
    { type: "separator" },
    {
      label: model.quitLabel,
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ];
  trayContextMenu = Menu.buildFromTemplate(template);
  if (process.platform === "darwin") {
    tray.setContextMenu(trayContextMenu);
  }
}

function openTrayContextMenu() {
  if (!tray || !trayContextMenu) return;
  tray.popUpContextMenu(trayContextMenu);
}

function createTray() {
  if (tray) return tray;
  tray = new Tray(createTrayImage());
  tray.on("click", () => showMainWindow());
  if (process.platform !== "darwin") {
    tray.on("right-click", () => {
      void (async () => {
        await updateTrayMenu();
        openTrayContextMenu();
      })();
    });
  }
  void updateTrayMenu();
  return tray;
}

function createWindow() {
  mainWindow = new BrowserWindow(buildBrowserWindowOptions());
  if (isElectronDev) {
    mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
      emitOutput("stderr", `[dev] preload failed (${preloadPath}): ${error?.message || error}\n`);
    });
  }
  forceLightModeForWindow(mainWindow);

  mainWindow.on("close", (event) => {
    if (quitting) return;
    if (isElectronDev) {
      quitting = true;
      app.quit();
      return;
    }
    event.preventDefault();
    hideMainWindow();
  });
  mainWindow.on("show", () => {
    void updateTrayMenu();
  });
  mainWindow.on("hide", () => {
    void updateTrayMenu();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    void updateTrayMenu();
  });

  const devUrl = isElectronDev ? process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:31873" : "";
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.once("did-finish-load", () => {
      void (async () => {
        try {
          const hasProfiles = await mainWindow.webContents.executeJavaScript(
            "Boolean(window.clovapiCli?.profilesLoad)",
            true,
          );
          emitOutput("system", `[dev] preload bridge profiles=${hasProfiles}\n`);
          if (!hasProfiles) {
            emitOutput("stderr", "[dev] preload bridge missing — restart npm run dev\n");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emitOutput("stderr", `[dev] bridge check failed: ${message}\n`);
        }
      })();
    });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "ui-dist", "index.html"));
  }
}

function emitOutput(type, chunk) {
  const text = String(chunk ?? "");
  if (process.env.ELECTRON_DEV === "1" && text) {
    process.stdout.write(`[clovapi:${type}] ${text}`);
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("cli:output", {
    type,
    data: text
  });
}

async function resolveClovapiExecutablePath() {
  return (await resolveClovapiExecutableAsync()) || "";
}

const proxyManager = createClovapiProxy();

async function listProxyLogs(payload = {}) {
  const callLogPage = {
    limit: Math.max(1, Number(payload?.limit) || callLogsStore.DEFAULT_CALL_LOG_PAGE_SIZE || 20),
    offset: Math.max(0, Number(payload?.offset) || 0),
    hasMore: false,
  };
  try {
    const proxy = await proxyManager.loadProxyConfig();
    const [page, system] = await Promise.all([
      callLogsStore.readCallLogsViaHTTP({ ...callLogPage, proxy }),
      callLogsStore.readSystemLogsViaHTTP(20, { proxy }),
    ]);
    return {
      ok: true,
      requests: page.entries,
      sessions: page.sessions,
      system,
      callLogPage: {
        limit: page.limit,
        offset: page.offset,
        hasMore: page.hasMore,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read proxy logs",
      requests: [],
      sessions: [],
      system: [],
      callLogPage,
    };
  }
}

async function clearProxyLogs(scope = "all") {
  const normalized = String(scope || "all").trim().toLowerCase();
  const proxy = await proxyManager.loadProxyConfig();
  await callLogsStore.clearProxyDebugLogs(normalized, { proxy });
  return listProxyLogs({ offset: 0, limit: callLogsStore.DEFAULT_CALL_LOG_PAGE_SIZE });
}

async function deleteProxyLogSession(session) {
  const key = String(session || "").trim();
  if (!key) {
    return { ok: false, error: "session is required" };
  }
  try {
    const proxy = await proxyManager.loadProxyConfig();
    await callLogsStore.deleteCallLogSessionViaHTTP(key, { proxy });
    return listProxyLogs({
      offset: 0,
      limit: callLogsStore.DEFAULT_CALL_LOG_PAGE_SIZE,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to delete session",
    };
  }
}

function scheduleCoreProxyRestart() {
  clearTimeout(coreDevRestartTimer);
  coreDevRestartTimer = setTimeout(async () => {
    if (proxyManager.isAutostartSuppressed()) {
      emitOutput("system", "[core-watch] core rebuilt; proxy autostart suppressed (user stopped)\n");
      return;
    }
    emitOutput("system", "[core-watch] core rebuilt; restarting proxy\n");
    try {
      await proxyManager.stop({ suppressAutostart: false });
      const cfg = await proxyManager.loadProxyConfig();
      const result = await proxyManager.start({ port: cfg.port, host: cfg.host });
      if (result?.ok) {
        emitOutput("system", "[core-watch] proxy restarted\n");
        dispatchRendererEvent({ type: "proxy-status-changed" });
      } else {
        emitOutput("stderr", `[core-watch] proxy restart failed: ${result?.error || "unknown"}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitOutput("stderr", `[core-watch] proxy restart failed: ${message}\n`);
    }
  }, 250);
}

function watchCoreDevBinary() {
  if (process.env.ELECTRON_DEV !== "1") return;
  const stateFile = coreDevStatePath();
  const stateDir = path.dirname(stateFile);
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    coreDevWatcher = fs.watch(stateDir, (_event, filename) => {
      if (String(filename || "") === path.basename(stateFile)) {
        scheduleCoreProxyRestart();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitOutput("stderr", `[core-watch] failed to watch core dev binary: ${message}\n`);
  }
}

/** Spawn clovapi (or any executable) and resolve when the child exits. */
function spawnExecutableAndWait(executable, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env: cliSpawnEnv(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningProcess = child;
    const stdoutChunks = [];
    const stderrChunks = [];
    const cmdLine = `$ ${executable} ${args.join(" ")}`;
    emitOutput("system", `${cmdLine}\n`);
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(String(chunk ?? ""));
      emitOutput("stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(String(chunk ?? ""));
      emitOutput("stderr", chunk);
    });
    child.on("error", (error) => {
      const message = error.message || "Failed to start clovapi.";
      emitOutput("stderr", `${message}\n`);
      runningProcess = null;
      resolve({ ok: false, error: message, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") });
    });
    child.on("close", (code, signal) => {
      const exitLine = `[exit] code=${String(code)} signal=${String(signal)}`;
      emitOutput("system", `\n${exitLine}\n`);
      runningProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("cli:exit", { code, signal });
      }
      resolve({
        ok: true,
        code,
        signal,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
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

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("desktop:check-update", async () => {
  if (isElectronDev) {
    return {
      ok: false,
      error: "Desktop update is disabled in Electron dev mode (ELECTRON_DEV=1).",
    };
  }
  try {
    const detail = await checkDesktopUpdate(app.getVersion());
    if (!detail.ok) {
      return { ok: false, error: detail.error || "Failed to check desktop update." };
    }
    return { ok: true, detail: sanitizeForIpc(detail) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to check desktop update.",
    };
  }
});

ipcMain.handle("desktop:install-update", async () => {
  if (isElectronDev) {
    return {
      ok: false,
      error: "Desktop update is disabled in Electron dev mode (ELECTRON_DEV=1).",
    };
  }
  try {
    const detail = await downloadAndLaunchDesktopUpdate({
      onProgress(progress) {
        dispatchRendererEvent({
          type: "desktop-update-progress",
          ...sanitizeForIpc(progress),
        });
      },
    });
    dispatchRendererEvent({
      type: "desktop-update-progress",
      percent: 100,
    });
    setTimeout(() => {
      quitting = true;
      app.quit();
    }, 400);
    return { ok: true, detail: sanitizeForIpc(detail) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to install desktop update.",
    };
  }
});

ipcMain.handle("cli:run-clovapi", async (_event, payload) => {
  if (runningProcess) {
    return { ok: false, error: "A command is already running." };
  }
  const executable = await resolveClovapiExecutablePath();
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
    return {
      ok: true,
      code: result.code ?? null,
      signal: result.signal ?? null,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start clovapi.",
    };
  }
});

ipcMain.handle("cli:update", async (_event, payload) => {
  if (process.env.ELECTRON_DEV === "1") {
    return {
      ok: false,
      error: "Core update is disabled in Electron dev mode (ELECTRON_DEV=1).",
      detail: { dev_mode: true, check: Boolean(payload?.check) },
    };
  }
  const executable = await resolveClovapiExecutablePath();
  if (!executable) {
    return { ok: false, error: "clovapi executable not found" };
  }
  if (!payload?.check) {
    try {
      await proxyManager.stop({ suppressAutostart: true });
    } catch {
      /* best effort before replacing the user-managed CLI binary */
    }
  }
  const args = ["update", "--json"];
  if (payload?.check) args.push("--check");
  if (payload?.version) args.push("--version", String(payload.version));
  const result = await spawnExecutableAndWait(executable, args, process.cwd());
  if (!result.ok) {
    return { ok: false, error: result.error || "Failed to run clovapi update." };
  }
  let detail = null;
  try {
    detail = JSON.parse(String(result.stdout || "").trim() || "{}");
  } catch {
    detail = { raw: result.stdout, stderr: result.stderr };
  }
  if ((result.code ?? 1) !== 0) {
    return {
      ok: false,
      error: String(result.stderr || result.stdout || "clovapi update failed").trim(),
      detail,
    };
  }
  return { ok: true, detail, stdout: result.stdout, stderr: result.stderr };
});

ipcMain.handle("cli:profiles-load", async () => {
  try {
    return await clovapiDesktop.loadProfiles();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load profiles.json",
    };
  }
});

ipcMain.handle("cli:profiles-save", async (_event, payload) => {
  try {
    const result = await clovapiDesktop.saveProfiles(payload);
    await updateTrayMenu();
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save profiles.json",
    };
  }
});

ipcMain.handle("cli:profiles-list-models", async (_event, payload) => {
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

ipcMain.handle("cli:profiles-usage", async (_event, payload) => {
  try {
    const vendorName = String(payload?.vendorName || "").trim();
    if (!vendorName) {
      return { ok: false, error: "vendorName is required" };
    }
    return await clovapiDesktop.queryVendorUsage(vendorName);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to query vendor usage",
    };
  }
});

ipcMain.handle("cli:profiles-catalog", async () => {
  try {
    return await clovapiDesktop.modelAdapters();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to list model adapters",
    };
  }
});

ipcMain.handle("cli:profiles-test", async (_event, payload) => {
  try {
    const requestedPort = Number(payload?.proxy?.port) || 0;
    const body = {
      binding: payload?.binding,
      provider: payload?.provider,
      provider_id: payload?.provider_id,
      model: payload?.model,
      model_id: payload?.model_id,
      cli: payload?.cli,
      proxy: {
        port: requestedPort || 27483,
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

ipcMain.handle("cli:switch", async (_event, payload) => {
  try {
    const cliKind = String(payload?.cli || payload?.cliKind || "").trim();
    const providerId = String(payload?.provider || payload?.providerId || "").trim();
    const modelId = String(payload?.model || payload?.modelId || "").trim();
    const reset = Boolean(payload?.reset);
    if (reset) {
      const { runClovapiArgsAsync } = require("./clovapi-exec");
      const result = await runClovapiArgsAsync(["switch", "--cli", cliKind, "--reset", "--json"], {
        timeout: 45000,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: String(result.stderr || result.stdout || "clovapi switch failed").trim(),
        };
      }
      try {
        return JSON.parse(String(result.stdout || "").trim() || "{}");
      } catch {
        return { ok: false, error: "invalid JSON from clovapi switch" };
      }
    }
    if (!cliKind || !providerId || !modelId) {
      return { ok: false, error: "cli, provider, and model are required" };
    }
    return await clovapiDesktop.switchProviderModel(cliKind, providerId, modelId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "clovapi switch failed",
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
  return clovapiDesktop.whichCommand(command);
});

ipcMain.handle("cli:agent-status", async () => {
  return clovapiDesktop.agentStatus();
});

ipcMain.handle("cli:agent-install", async (_event, payload) => {
  return clovapiDesktop.agentInstall(String(payload?.kind || ""));
});

ipcMain.handle("cli:agent-uninstall", async (_event, payload) => {
  return clovapiDesktop.agentUninstall(String(payload?.kind || ""));
});

ipcMain.handle("cli:auth-status", async () => {
  try {
    return await clovapiDesktop.authStatus();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read subscription status",
    };
  }
});

ipcMain.handle("cli:auth-login", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  return clovapiDesktop.authLogin(provider);
});

ipcMain.handle("cli:auth-login-cancel", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  return clovapiDesktop.cancelAuthLogin(provider);
});

ipcMain.handle("cli:auth-logout", async (_event, payload) => {
  const provider = String(payload?.provider || "").trim();
  try {
    return await clovapiDesktop.authLogout(provider);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to logout subscription",
    };
  }
});

ipcMain.handle("cli:proxy-status", async () => {
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

ipcMain.handle("cli:proxy-health", async () => {
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

ipcMain.handle("cli:proxy-start", async (_event, payload) => {
  try {
    const port = Number(payload?.port) || undefined;
    const result = await proxyManager.start({ port });
    dispatchRendererEvent({ type: "proxy-status-changed" });
    await updateTrayMenu();
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start proxy",
    };
  }
});

ipcMain.handle("cli:proxy-stop", async (_event, payload) => {
  try {
    const suppressAutostart = payload?.suppressAutostart !== false;
    const result = await proxyManager.stop({ suppressAutostart });
    dispatchRendererEvent({ type: "proxy-status-changed" });
    await updateTrayMenu();
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to stop proxy",
    };
  }
});

ipcMain.handle("cli:proxy-logs-list", async (_event, payload) => listProxyLogs(payload));

ipcMain.handle("cli:proxy-logs-clear", async (_event, payload) =>
  clearProxyLogs(String(payload?.scope || "all")),
);

ipcMain.handle("cli:proxy-logs-delete-session", async (_event, payload) =>
  deleteProxyLogSession(String(payload?.session || "")),
);

ipcMain.handle("cli:tool-status", async () => {
  const executable = await resolveClovapiExecutablePath();
  if (executable) {
    const source = executable === cliBinPath() ? "user" : "system";
    return { ok: true, available: true, source, path: executable };
  }
  return { ok: false, available: false, source: "none", path: "", error: "No clovapi binary found" };
});

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = "light";
    createWindow();
    if (!isElectronDev) {
      createTray();
    }
    watchCoreDevBinary();
    try {
      if (!isElectronDev && fs.existsSync(cliBinPath())) {
        ensureCliBinOnPath();
      }
    } catch {
      /* PATH registration is best-effort */
    }
    try {
      await proxyManager.autostartIfAllowed();
    } catch {
      // Non-fatal on startup
    }
    await updateTrayMenu();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", async () => {
  stopRunningProcess();
  if (coreDevWatcher) {
    coreDevWatcher.close();
    coreDevWatcher = null;
  }
  // Await proxy shutdown (bounded) so the detached daemon doesn't outlive the
  // app, holding the port and API keys in memory. The timeout prevents a hung
  // stop from blocking quit indefinitely.
  try {
    await Promise.race([
      proxyManager.stop(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    /* best effort */
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
});

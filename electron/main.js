const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

let mainWindow = null;
let runningProcess = null;
const THEME_STORAGE_KEY = "clovapi-theme";

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
    width: 920,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: "#0b1110",
    title: "ClovAPI Switcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  forceLightModeForWindow(mainWindow);

  void mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
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
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: mergedEnv
    });

    runningProcess = child;

    emitOutput("system", `$ ${command}\n`);

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

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start command."
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

app.whenReady().then(() => {
  nativeTheme.themeSource = "light";
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopRunningProcess();
  if (process.platform !== "darwin") app.quit();
});

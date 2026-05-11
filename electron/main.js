const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");

let mainWindow = null;
let runningProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: "#0b1110",
    title: "ClovAPI CLI Client",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function emitOutput(type, chunk) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("cli:output", {
    type,
    data: String(chunk ?? "")
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

  if (!command) {
    return { ok: false, error: "Command cannot be empty." };
  }

  try {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env
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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopRunningProcess();
  if (process.platform !== "darwin") app.quit();
});

import { execSync, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devPort = Number(process.env.VITE_DEV_PORT) || 31873;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${devPort}`;

function electronBinary() {
  return require("electron");
}

function listListeningPids(port) {
  const pids = new Set();
  if (process.platform === "win32") {
    try {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts.at(-1));
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
    } catch {
      /* port free */
    }
    return pids;
  }

  try {
    const out = execSync(`lsof -n -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  } catch {
    /* port free */
  }
  return pids;
}

function killPidTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

async function freePort(port) {
  const pids = listListeningPids(port);
  if (!pids.size) return;
  console.log(`[dev] Port ${port} is in use — stopping PID(s): ${[...pids].join(", ")}`);
  for (const pid of pids) killPidTree(pid);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const remaining = listListeningPids(port);
  if (remaining.size) {
    throw new Error(`Port ${port} is still in use by PID(s): ${[...remaining].join(", ")}`);
  }
}

function killOrphanProjectVite() {
  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { $_.CommandLine -match 'clovapi[\\\\/]+electron' -and $_.CommandLine -match 'vite(\\.config\\.mjs)?' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } catch {
      /* best effort */
    }
    return;
  }

  try {
    execSync(`pkill -f "${electronDir.replace(/"/g, '\\"')}/ui/vite.config.mjs"`, {
      stdio: "ignore",
    });
  } catch {
    /* best effort */
  }
}

function killOrphanProjectElectron() {
  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'electron.exe'\\" | Where-Object { $_.ExecutablePath -match 'clovapi[\\\\/]+electron' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } catch {
      /* best effort */
    }
    return;
  }

  try {
    execSync(`pkill -f "${electronDir.replace(/"/g, '\\"')}/node_modules/electron/dist/electron"`, {
      stdio: "ignore",
    });
  } catch {
    /* best effort */
  }
}

async function waitForViteHttp(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        const html = await response.text();
        if (html.includes("/@vite/client") || html.includes('id="app"') || html.includes('type="module"')) {
          return;
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite HTTP at ${url}`);
}

function waitForPort(port, timeoutMs = 120_000) {
  const hosts = ["127.0.0.1", "::1"];
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let hostIndex = 0;
    const tryOnce = () => {
      const host = hosts[hostIndex];
      const socket = net.connect({ port, host });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (hostIndex + 1 < hosts.length) {
          hostIndex += 1;
          tryOnce();
          return;
        }
        hostIndex = 0;
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for Vite on port ${port}`));
          return;
        }
        setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function killTree(child) {
  if (!child?.pid) return;
  killPidTree(child.pid);
}

let vite = null;
let electron = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree(electron);
  killTree(vite);
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  killOrphanProjectElectron();
  killOrphanProjectVite();
  await freePort(devPort);

  vite = spawn("npm", ["run", "dev:ui"], {
    cwd: electronDir,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  vite.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    shutdown(exitCode);
  });

  try {
    await waitForPort(devPort);
    await waitForViteHttp(devServerUrl);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    shutdown(1);
    return;
  }

  console.log("[dev] Vite ready — launching Electron.");
  console.log("[dev] Use the Electron window titled \"ClovAPI Switcher\" — do not open the Vite URL in a browser.");

  electron = spawn(electronBinary(), [electronDir, "--clovapi-dev"], {
    cwd: electronDir,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      ELECTRON_DEV: "1",
      VITE_DEV_SERVER_URL: devServerUrl,
    },
  });

  electron.on("error", (error) => {
    console.error(`[dev] Failed to launch Electron: ${error.message}`);
    shutdown(1);
  });

  if (!electron.pid) {
    console.error("[dev] Failed to launch Electron: no process id");
    shutdown(1);
    return;
  }
  console.log(`[dev] Electron PID ${electron.pid}`);

  electron.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      console.error(`[dev] Electron exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
    const exitCode = code ?? (signal ? 1 : 0);
    shutdown(exitCode);
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}

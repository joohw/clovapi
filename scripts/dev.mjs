import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const backendRoot = path.join(repoRoot, "backend");
const webRoot = path.join(repoRoot, "web");
const apiPort = 3500;
const webPort = 3000;

function spawnProcess(command, args, cwd, label, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("error", (error) => {
    console.error(`[${label}] failed to start:`, error);
  });
  return child;
}

function waitForPort(host, port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket
        .once("connect", () => {
          socket.destroy();
          resolve();
        })
        .once("timeout", () => {
          socket.destroy();
          retry();
        })
        .once("error", () => {
          socket.destroy();
          retry();
        })
        .connect(port, host);
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`timed out waiting for ${host}:${port}`));
        return;
      }
      setTimeout(tryConnect, 400);
    };

    tryConnect();
  });
}

function terminateChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGINT");
}

async function main() {
  console.log(`API:    http://127.0.0.1:${apiPort}  (Go)`);
  console.log(`Web:    http://127.0.0.1:${webPort}  (Next)`);
  console.log("Starting Go backend...");

  const api = spawnProcess("go", ["run", "."], backendRoot, "api", {
    ...process.env,
    PORT: String(apiPort),
  });
  let web = null;
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateChild(web);
    terminateChild(api);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  api.once("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[api] exited early with code ${code ?? "unknown"}`);
      shutdown();
      process.exit(code ?? 1);
    }
  });

  try {
    await waitForPort("127.0.0.1", apiPort, 90_000);
  } catch (error) {
    console.error(`[api] ${error.message}`);
    shutdown();
    process.exit(1);
  }

  console.log("Go is up. Starting Next dev server...");
  web = spawnProcess("npm", ["run", "dev"], webRoot, "web", process.env);

  web.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[web] exited with code ${code ?? "unknown"}`);
      shutdown();
      process.exit(code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

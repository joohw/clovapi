import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, "web");
const webPort = 27483;
const nextCliPath = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");

function spawnProcess(command, args, cwd, label, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
  });
  child.on("error", (error) => {
    console.error(`[${label}] failed to start:`, error);
  });
  return child;
}

function terminateChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGINT");
}

async function main() {
  console.log(`Web:    http://127.0.0.1:${webPort}  (Next)`);
  console.log("Starting Next dev server...");

  const web = spawnProcess(
    process.execPath,
    [nextCliPath, "dev", "-p", String(webPort), "--webpack"],
    webRoot,
    "web",
    {
      ...process.env,
      PORT: String(webPort),
    },
  );
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateChild(web);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

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

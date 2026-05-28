import { spawn } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
let shuttingDown = false;
let coreWatch = null;
let electron = null;

function spawnChild(command, args) {
  return spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: process.platform === "win32",
  });
}

function pipe(prefix, stream, onText) {
  stream.on("data", (chunk) => {
    const text = String(chunk || "");
    process.stdout.write(text);
    if (onText) onText(text);
  });
}

function killChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    return;
  }
  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChild(electron);
  killChild(coreWatch);
  setTimeout(() => process.exit(code), 100);
}

function startElectron() {
  if (electron) return;
  electron = spawn(npmCmd, ["-C", "electron", "run", "dev"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: false,
  });
  electron.on("close", (code) => shutdown(code ?? 0));
  electron.on("error", (error) => {
    console.error(error.message);
    shutdown(1);
  });
}

coreWatch = spawnChild(npmCmd, ["run", "core:watch"]);
pipe("core", coreWatch.stdout, (text) => {
  if (text.includes("CORE_WATCH_READY")) startElectron();
});
pipe("core", coreWatch.stderr);
coreWatch.on("close", (code) => {
  if (!electron) shutdown(code ?? 1);
});
coreWatch.on("error", (error) => {
  console.error(error.message);
  shutdown(1);
});

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

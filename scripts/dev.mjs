import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statePath = path.join(root, "core/.dev/current.json");
let server, currentBinary, quitting = false, restarting = Promise.resolve();
function child(command, args, cwd = root, piped = false) {
  const proc = spawn(command, args, { cwd, stdio: piped ? ["ignore", "pipe", "inherit"] : "inherit", windowsHide: true });
  proc.on("error", error => { console.error(error); shutdown(1); });
  return proc;
}
function kill(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }); } catch {}
  } else proc.kill("SIGTERM");
}
async function restart() {
  if (quitting) return;
  const next = JSON.parse(fs.readFileSync(statePath, "utf8")).path;
  if (currentBinary === next) return;
  if (server) {
    try { execFileSync(currentBinary, ["proxy", "stop"], { stdio: "inherit", windowsHide: true, timeout: 15000 }); } catch (error) { console.error(error.message); }
    const previous = server;
    server = null;
    kill(previous);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (quitting) return;
  currentBinary = next;
  const proc = child(next, ["serve", "--dev"]);
  server = proc;
  proc.on("exit", code => { if (server === proc && !quitting) shutdown(code ?? 1); });
}
const vite = child(process.execPath, [path.join(root, "web/node_modules/vite/bin/vite.js"), "--config", "vite.config.mjs"], path.join(root, "web"));
vite.on("exit", code => { if (!quitting) shutdown(code ?? 1); });
const watch = child(process.execPath, [path.join(root, "scripts/watch-core.mjs")], root, true);
let pending = "";
watch.stdout.on("data", chunk => {
  process.stdout.write(chunk);
  pending += String(chunk);
  let end;
  while ((end = pending.indexOf("\n")) >= 0) {
    const line = pending.slice(0, end); pending = pending.slice(end + 1);
    if (line.startsWith("[core-watch] ready ")) restarting = restarting.then(restart).catch(error => { console.error(error); shutdown(1); });
  }
});
watch.on("exit", code => { if (!quitting) shutdown(code ?? 1); });
function shutdown(code) {
  if (quitting) return;
  quitting = true;
  kill(server); kill(vite); kill(watch);
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
console.log("Development UI: http://127.0.0.1:31873 (open in your browser)");

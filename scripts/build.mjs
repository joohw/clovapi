import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, [path.join(root, "web/node_modules/vite/bin/vite.js"), "build", "--config", "vite.config.mjs"], path.join(root, "web"));
run("go", ["build", "-o", process.platform === "win32" ? "clovapi.exe" : "clovapi", "./cmd"], path.join(root, "core"));
console.log("Build ready. Run core/clovapi serve (core/clovapi.exe serve on Windows).");

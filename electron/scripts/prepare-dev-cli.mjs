import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(electronDir, "..");
const coreDir = path.join(repoRoot, "core");
const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
const coreBin = path.join(coreDir, exeName);
const electronBinDir = path.join(electronDir, "bin");
const electronBin = path.join(electronBinDir, exeName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("go", ["build", "-o", coreBin, "./cmd/clovapi"], { cwd: coreDir });
fs.mkdirSync(electronBinDir, { recursive: true });
fs.copyFileSync(coreBin, electronBin);
fs.chmodSync(electronBin, 0o755);
console.log(`Dev clovapi ready:\n  ${coreBin}\n  ${electronBin}`);

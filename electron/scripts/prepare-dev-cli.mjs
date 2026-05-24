import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(electronDir, "..");
const switcherDir = path.join(repoRoot, "switcher");
const switcherBin = path.join(switcherDir, "clovapi");
const electronBinDir = path.join(electronDir, "bin");
const electronBin = path.join(electronBinDir, "clovapi");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("go", ["build", "-o", switcherBin, "./cmd/clovapi"], { cwd: switcherDir });
fs.mkdirSync(electronBinDir, { recursive: true });
fs.copyFileSync(switcherBin, electronBin);
fs.chmodSync(electronBin, 0o755);
console.log(`Dev clovapi ready:\n  ${switcherBin}\n  ${electronBin}`);

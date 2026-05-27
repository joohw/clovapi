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
const buildInfoVersionVar = "github.com/clovapi/switcher/internal/buildinfo.Version";

function resolveDevVersion() {
  const result = spawnSync("git", ["tag", "--sort=-v:refname"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const tags = String(result.stdout || "")
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  for (const tag of tags) {
    const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (match) {
      const [, major, minor, patch] = match;
      return `dev${major}.${minor}.${Number(patch) + 1}`;
    }
  }
  return "dev0.1.0";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const devVersion = resolveDevVersion();
run("go", ["build", `-ldflags=-X ${buildInfoVersionVar}=${devVersion}`, "-o", coreBin, "./cmd/clovapi"], { cwd: coreDir });
fs.mkdirSync(electronBinDir, { recursive: true });
fs.copyFileSync(coreBin, electronBin);
fs.chmodSync(electronBin, 0o755);
console.log(`Dev clovapi ${devVersion} ready:\n  ${coreBin}\n  ${electronBin}`);

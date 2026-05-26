import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(repoRoot, "core");
const devDir = path.join(coreDir, ".dev");
const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
const statePath = path.join(devDir, "current.json");
const pollMs = 800;

let lastFingerprint = "";
let buildTimer = null;
let building = false;
let pending = false;
let readyPrinted = false;

function shouldTrack(filePath) {
  const rel = path.relative(coreDir, filePath);
  if (!rel || rel.startsWith("..")) return false;
  const parts = rel.split(path.sep);
  if (parts.some((part) => part === ".dev" || part === "dist")) return false;
  return filePath.endsWith(".go") || filePath.endsWith("go.mod") || filePath.endsWith("go.sum");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".dev" || entry.name === "dist") continue;
      walk(full, out);
    } else if (entry.isFile() && shouldTrack(full)) {
      out.push(full);
    }
  }
  return out;
}

function fingerprint() {
  return walk(coreDir)
    .sort()
    .map((file) => {
      const stat = fs.statSync(file);
      return `${path.relative(coreDir, file)}:${stat.mtimeMs}:${stat.size}`;
    })
    .join("|");
}

function cleanupOldBuilds(activePath) {
  const entries = fs
    .readdirSync(devDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith("clovapi-dev-"))
    .map((entry) => path.join(devDir, entry.name))
    .filter((file) => path.resolve(file) !== path.resolve(activePath))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const file of entries.slice(5)) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Old Windows processes can keep previous binaries locked briefly.
    }
  }
}

function build() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  pending = false;
  fs.mkdirSync(devDir, { recursive: true });
  const suffix = `${Date.now()}-${process.pid}`;
  const outPath = path.join(devDir, `clovapi-dev-${suffix}${process.platform === "win32" ? ".exe" : ""}`);
  console.log(`[core-watch] building ${outPath}`);
  const result = spawnSync("go", ["build", "-o", outPath, "./cmd/clovapi"], {
    cwd: coreDir,
    stdio: "inherit",
  });
  building = false;
  if (result.status !== 0) {
    console.error(`[core-watch] build failed with code ${result.status ?? 1}`);
    if (pending) scheduleBuild();
    return;
  }
  if (process.platform !== "win32") {
    fs.chmodSync(outPath, 0o755);
  }
  fs.writeFileSync(
    statePath,
    JSON.stringify({ path: outPath, builtAt: new Date().toISOString() }, null, 2),
  );
  cleanupOldBuilds(outPath);
  console.log(`[core-watch] ready ${outPath}`);
  if (!readyPrinted) {
    readyPrinted = true;
    console.log(`CORE_WATCH_READY ${outPath}`);
  }
  if (pending) scheduleBuild();
}

function scheduleBuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(build, 200);
}

function tick() {
  try {
    const next = fingerprint();
    if (next !== lastFingerprint) {
      lastFingerprint = next;
      scheduleBuild();
    }
  } catch (error) {
    console.error(`[core-watch] scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

lastFingerprint = fingerprint();
build();
setInterval(tick, pollMs);

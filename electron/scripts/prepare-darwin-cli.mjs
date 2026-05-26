import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.resolve(electronDir, "..", "core");
const binDir = path.join(electronDir, "bin");
const output = path.join(binDir, "clovapi");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function buildCli(arch, outPath) {
  run("go", ["build", "-ldflags=-s -w", "-o", outPath, "./cmd/clovapi"], {
    cwd: coreDir,
    env: { ...process.env, GOOS: "darwin", GOARCH: arch, CGO_ENABLED: "0" },
  });
}

fs.mkdirSync(binDir, { recursive: true });

const arm64Path = path.join(binDir, "clovapi-arm64");
const amd64Path = path.join(binDir, "clovapi-amd64");

buildCli("arm64", arm64Path);
buildCli("amd64", amd64Path);
run("lipo", ["-create", "-output", output, arm64Path, amd64Path]);
fs.chmodSync(output, 0o755);
fs.unlinkSync(arm64Path);
fs.unlinkSync(amd64Path);

console.log(`Built universal clovapi at ${output}`);

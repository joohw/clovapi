import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.resolve(electronDir, "..", "core");
const binDir = path.join(electronDir, "bin");
const output = path.join(binDir, "clovapi.exe");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

fs.mkdirSync(binDir, { recursive: true });
run("go", ["build", "-ldflags=-s -w", "-o", output, "./cmd/clovapi"], {
  cwd: coreDir,
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
});

console.log(`Built Windows clovapi at ${output}`);

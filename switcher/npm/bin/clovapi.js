#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const exeName = process.platform === "win32" ? "clovapi.exe" : "clovapi";
const binPath = path.join(__dirname, "..", "vendor", exeName);

if (!fs.existsSync(binPath)) {
  console.error("clovapi binary is not installed.");
  console.error("Reinstall with: npm i -g @clovapi/cli");
  process.exit(1);
}

const result = spawnSync(binPath, process.argv.slice(2), {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);

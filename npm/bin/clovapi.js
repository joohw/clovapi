#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const { cliBinPath, vendorBinPath } = require("../scripts/paths");

const binPath = [cliBinPath(), vendorBinPath()].find((candidate) => fs.existsSync(candidate));

if (!binPath) {
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

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function sleepSync(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    /* spin */
  }
}

function stopProxy(cliPath) {
  const target = String(cliPath || "").trim();
  if (!target || !fs.existsSync(target)) {
    return;
  }
  try {
    spawnSync(target, ["proxy", "stop"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 15000,
    });
  } catch {
    /* best effort */
  }
  sleepSync(400);
}

function removeIfExists(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

function runDeferredWindowsReplace(targetPath, pendingPath, cliPath) {
  const script = [
    "$ErrorActionPreference = 'Continue'",
    `$target = ${JSON.stringify(targetPath)}`,
    `$pending = ${JSON.stringify(pendingPath)}`,
    `$cli = ${JSON.stringify(cliPath || targetPath)}`,
    "for ($i = 0; $i -lt 40; $i++) {",
    "  try {",
    "    if (Test-Path $cli) { & $cli proxy stop 2>$null | Out-Null }",
    "    Start-Sleep -Milliseconds 300",
    "    if (Test-Path $target) { Remove-Item -LiteralPath $target -Force -ErrorAction Stop }",
    "    Move-Item -LiteralPath $pending -Destination $target -Force -ErrorAction Stop",
    "    Remove-Item -LiteralPath ($target + '.old') -Force -ErrorAction SilentlyContinue",
    "    exit 0",
    "  } catch {",
    "    Start-Sleep -Milliseconds 500",
    "  }",
    "}",
    "exit 1",
  ].join("\n");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      timeout: 60000,
    }
  );
  return (
    result.status === 0 &&
    fs.existsSync(targetPath) &&
    !fs.existsSync(pendingPath)
  );
}

function installBinaryWindows(sourcePath, targetPath) {
  const target = path.resolve(String(targetPath || "").trim());
  const source = path.resolve(String(sourcePath || "").trim());
  if (!target || !source || !fs.existsSync(source)) {
    throw new Error("install paths are invalid");
  }

  stopProxy(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const tmpPath = path.join(
    path.dirname(target),
    `.clovapi-install-${process.pid}-${Date.now()}`
  );
  fs.copyFileSync(source, tmpPath);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      if (fs.existsSync(target)) {
        removeIfExists(target);
        if (fs.existsSync(target)) {
          try {
            fs.renameSync(target, `${target}.old`);
          } catch {
            /* still locked */
          }
        }
      }
      fs.renameSync(tmpPath, target);
      removeIfExists(`${target}.old`);
      return;
    } catch {
      stopProxy(target);
      sleepSync(300 * (attempt + 1));
    }
  }

  removeIfExists(tmpPath);
  const pendingPath = `${target}.new`;
  fs.copyFileSync(source, pendingPath);
  if (runDeferredWindowsReplace(target, pendingPath, target)) {
    return;
  }

  removeIfExists(pendingPath);
  throw new Error(
    `EPERM: operation not permitted, replace '${target}'. Stop the clovapi proxy and retry.`
  );
}

module.exports = {
  installBinaryWindows,
  stopProxy,
};

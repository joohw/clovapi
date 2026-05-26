const os = require("node:os");
const path = require("node:path");

function configDir() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "clovapi");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, "clovapi");
  return path.join(os.homedir(), ".config", "clovapi");
}

function exeName() {
  return process.platform === "win32" ? "clovapi.exe" : "clovapi";
}

function cliBinDir() {
  return path.join(configDir(), "bin");
}

function cliBinPath() {
  return path.join(cliBinDir(), exeName());
}

function cliVersionMetaPath() {
  return path.join(cliBinDir(), "version.txt");
}

function cliInstallLockPath() {
  return path.join(cliBinDir(), ".install.lock");
}

function vendorBinPath() {
  return path.join(__dirname, "..", "vendor", exeName());
}

module.exports = {
  cliBinDir,
  cliBinPath,
  cliInstallLockPath,
  cliVersionMetaPath,
  configDir,
  exeName,
  vendorBinPath,
};

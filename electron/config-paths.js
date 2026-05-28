const path = require("node:path");
const os = require("node:os");

function configDir() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "clovapi");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, "clovapi");
  return path.join(os.homedir(), ".config", "clovapi");
}

function cliBinPath() {
  const name = process.platform === "win32" ? "clovapi.exe" : "clovapi";
  return path.join(configDir(), "bin", name);
}

function logsDir() {
  return path.join(configDir(), "logs");
}

function electronUserDataDir() {
  return path.join(configDir(), "desktop");
}

function electronDevUserDataDir() {
  return path.join(configDir(), "desktop-dev");
}

function callLogsDBPath() {
  return path.join(logsDir(), "call-logs.sqlite");
}

module.exports = {
  configDir,
  cliBinPath,
  logsDir,
  electronUserDataDir,
  electronDevUserDataDir,
  callLogsDBPath,
};

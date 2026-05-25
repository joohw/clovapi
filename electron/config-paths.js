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

function callLogsDir() {
  return path.join(configDir(), "call-logs");
}

function callLogsDBPath() {
  return path.join(callLogsDir(), "call-logs.sqlite");
}

module.exports = {
  configDir,
  cliBinPath,
  callLogsDir,
  callLogsDBPath,
};

const systemLogsStore = require("./system-logs-store");

function listSystem() {
  return systemLogsStore.readSystemLogs(0).map((entry) => ({ ...entry }));
}

function clearSystem() {
  systemLogsStore.clearSystemLogsFile();
}

module.exports = {
  listSystem,
  clearSystem,
};

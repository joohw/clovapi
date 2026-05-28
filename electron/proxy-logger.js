const systemLogsStore = require("./system-logs-store");

async function listSystem() {
  const entries = await systemLogsStore.readSystemLogs(0);
  return entries.map((entry) => ({ ...entry }));
}

async function clearSystem() {
  await systemLogsStore.clearSystemLogsFile();
}

module.exports = {
  listSystem,
  clearSystem,
};

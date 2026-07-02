const APP_DISPLAY_NAME = "Clov API代理";

const VALID_TABS = new Set(["profiles", "models", "call-logs", "system-logs", "settings"]);

function isValidTrayTab(tab) {
  return VALID_TABS.has(String(tab || "").trim());
}

function trayStatusSummary(state = {}) {
  const running = Boolean(state.running);
  const port = Number(state.port) || 27483;
  const external = Boolean(state.external);
  const managed = Boolean(state.managed);
  const error = String(state.error || "").trim();

  if (running) {
    const owner = external ? "external" : managed ? "managed" : "active";
    return `Proxy running on :${port} (${owner})`;
  }
  if (error) {
    return `Proxy stopped - ${error}`;
  }
  return `Proxy stopped on :${port}`;
}

function trayTooltip(summary) {
  const detail = String(summary || "").trim();
  return detail ? `${APP_DISPLAY_NAME} - ${detail}` : APP_DISPLAY_NAME;
}

function buildTrayMenuModel(state = {}) {
  const running = Boolean(state.running);
  const port = Number(state.port) || 27483;

  return {
    windowLabel: `Show ${APP_DISPLAY_NAME}`,
    profilesLabel: "Open Profiles",
    settingsLabel: "Open Settings",
    logsLabel: "Open Call Logs",
    statusLabel: trayStatusSummary(state),
    startProxyLabel: `Start Proxy on :${port}`,
    canStartProxy: !running,
    quitLabel: `Quit ${APP_DISPLAY_NAME}`,
  };
}

module.exports = {
  buildTrayMenuModel,
  isValidTrayTab,
  trayStatusSummary,
  trayTooltip,
};

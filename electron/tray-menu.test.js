const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildTrayMenuModel,
  isValidTrayTab,
  trayStatusSummary,
  trayTooltip,
} = require("./tray-menu");

test("isValidTrayTab accepts known desktop tabs", () => {
  assert.equal(isValidTrayTab("profiles"), true);
  assert.equal(isValidTrayTab("models"), true);
  assert.equal(isValidTrayTab("settings"), true);
  assert.equal(isValidTrayTab("call-logs"), true);
  assert.equal(isValidTrayTab("sessions"), false);
  assert.equal(isValidTrayTab("unknown"), false);
});

test("trayStatusSummary describes proxy state", () => {
  assert.equal(trayStatusSummary({ running: true, managed: true, port: 27483 }), "Proxy running on :27483 (managed)");
  assert.equal(trayStatusSummary({ running: false, port: 3000, error: "health failed" }), "Proxy stopped - health failed");
});

test("trayTooltip prefixes app name", () => {
  assert.equal(trayTooltip("Proxy running on :27483 (managed)"), "Clov API代理 - Proxy running on :27483 (managed)");
});

test("buildTrayMenuModel exposes proxy actions", () => {
  const running = buildTrayMenuModel({ running: true, managed: true, port: 27483 });
  assert.equal(running.windowLabel, "Show Clov API代理");
  assert.equal(running.canStartProxy, false);
  assert.equal(running.startProxyLabel, "Start Proxy on :27483");
  assert.match(running.statusLabel, /Proxy running/);
  assert.equal(running.quitLabel, "Quit Clov API代理");

  const stopped = buildTrayMenuModel({ running: false, port: 3000 });
  assert.equal(stopped.canStartProxy, true);
  assert.equal(stopped.startProxyLabel, "Start Proxy on :3000");
});

import { detectCliPath, detectOllamaInstalled, setRunning } from "./cli";
import { loadVendorCatalog } from "./catalog";
import { loadModelTests } from "./model-tests";
import { openProfilesVendor, setActiveTab } from "./navigation";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus } from "./proxy";
import { refreshSubscriptions } from "./subscriptions";
import { refreshAppVersion, waitForDesktopBridge } from "./app-version";
import { startAppUpdatePolling } from "./desktop-update";
import { isElectronRenderer } from "../constants";
import { store } from "./state.svelte";

export async function initApp() {
  if (isElectronRenderer()) {
    await waitForDesktopBridge();
  }
  await refreshAppVersion();
  startAppUpdatePolling();
  store.modelTests = loadModelTests();
  await loadVendorCatalog();
  await loadProfilesFromDisk();
  await refreshSubscriptions();
  await refreshProxyStatus();
  await refreshProxyLogs();

  const desktopBridge = window.clovapiDesktop;
  if (desktopBridge?.onAppEvent) {
    desktopBridge.onAppEvent((payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "open-tab") {
        setActiveTab(payload.tab);
        return;
      }
      if (payload.type === "open-profiles-vendor") {
        void (async () => {
          await loadProfilesFromDisk();
          setActiveTab("profiles");
          openProfilesVendor(payload.vendorName);
        })();
        return;
      }
      if (payload.type === "proxy-status-changed") {
        void refreshProxyStatus();
        void refreshProxyLogs();
        return;
      }
      if (payload.type === "profiles-changed") {
        void loadProfilesFromDisk();
      }
    });
  }

  const bridge = window.clovapiCli;
  if (bridge) {
    bridge.onExit(() => setRunning(false));
    const runState = await bridge.state().catch(() => ({ running: false }));
    setRunning(Boolean(runState?.running));
    const tool = await bridge.toolStatus?.().catch(() => null);
    store.clovapiAvailable = Boolean(tool?.available);
    await detectCliPath();
    await detectOllamaInstalled();
  }
}

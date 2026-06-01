import { detectCliPath, detectOllamaInstalled, setRunning } from "./cli";
import { loadVendorCatalog } from "./catalog";
import { loadModelTests } from "./model-tests";
import { openProfilesVendor, setActiveTab } from "./navigation";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus, autoUpdateCoreOnStartup } from "./proxy";
import { refreshSubscriptions } from "./subscriptions";
import { refreshAppVersion, waitForDesktopBridge, waitForCliBridge } from "./app-version";
import { startAppUpdatePolling } from "./desktop-update";
import { isElectronDev, isElectronRenderer } from "../constants";
import { store } from "./state.svelte";

function updateAppDownloadProgress(payload: { percent?: unknown; received_bytes?: unknown; total_bytes?: unknown }) {
  const percent = Number(payload.percent);
  if (Number.isFinite(percent)) {
    store.appUpdateProgress = Math.min(100, Math.max(0, Math.round(percent)));
  }
  const receivedBytes = Number(payload.received_bytes);
  if (Number.isFinite(receivedBytes)) {
    store.appUpdateProgressReceivedBytes = Math.max(0, receivedBytes);
  }
  const totalBytes = Number(payload.total_bytes);
  if (Number.isFinite(totalBytes)) {
    store.appUpdateProgressTotalBytes = Math.max(0, totalBytes);
  }
}

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
      if (payload.type === "desktop-update-progress") {
        updateAppDownloadProgress(payload);
        return;
      }
      if (payload.type === "profiles-changed") {
        void loadProfilesFromDisk();
      }
    });
  }

  const bridge = window.clovapiCli;
  if (bridge) {
    await waitForCliBridge();
    bridge.onExit(() => setRunning(false));
    const runState = await bridge.state().catch(() => ({ running: false }));
    setRunning(Boolean(runState?.running));
    const tool = await bridge.toolStatus?.().catch(() => null);
    store.clovapiAvailable = Boolean(tool?.available);
    await detectCliPath();
    await detectOllamaInstalled();
  }

  if (isElectronRenderer() && !isElectronDev()) {
    void autoUpdateCoreOnStartup();
  }
}

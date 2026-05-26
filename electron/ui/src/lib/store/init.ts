import { detectCliPath, detectOllamaInstalled, setRunning } from "./cli";
import { loadVendorCatalog } from "./catalog";
import { loadModelTests } from "./model-tests";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus } from "./proxy";
import { refreshSubscriptions } from "./subscriptions";
import { store } from "./state.svelte";

export async function initApp() {
  store.modelTests = loadModelTests();
  await loadVendorCatalog();
  await loadProfilesFromDisk();
  await refreshSubscriptions();
  await refreshProxyStatus();
  await refreshProxyLogs();

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

import { detectCliPath, detectOllamaInstalled, setRunning } from "./cli";
import { loadModelTests } from "./model-tests";
import { loadPresets } from "./presets";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyStatus } from "./proxy";
import { refreshSubscriptions } from "./subscriptions";
import { store } from "./state.svelte";

export async function initApp() {
  store.modelTests = loadModelTests();
  await loadPresets();
  await loadProfilesFromDisk();
  await refreshSubscriptions();
  await refreshProxyStatus();

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

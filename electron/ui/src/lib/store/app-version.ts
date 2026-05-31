import { isElectronRenderer } from "../constants";
import { store } from "./state.svelte";

async function waitForProfilesBridge(timeoutMs = 5000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.clovapiProfiles?.load) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return Boolean(window.clovapiProfiles?.load);
}

export async function waitForCliBridge(timeoutMs = 5000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.clovapiCli?.agentStatus) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return Boolean(window.clovapiCli?.agentStatus);
}

export async function waitForDesktopBridge(timeoutMs = 5000): Promise<boolean> {
  if (!isElectronRenderer()) return false;
  return waitForProfilesBridge(timeoutMs);
}

export async function refreshAppVersion() {
  if (!isElectronRenderer()) {
    store.appVersion = "";
    return;
  }

  await waitForProfilesBridge();

  try {
    const version = await window.clovapiEnv?.getVersion?.();
    store.appVersion = String(version || "").trim();
    if (store.appVersion) {
      document.title = `ClovAPI Switcher v${store.appVersion}`;
    }
  } catch {
    store.appVersion = "";
  }
}

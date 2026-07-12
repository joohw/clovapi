import { detectOllamaInstalled } from "./local-runtime";
import { refreshModelList } from "./model-list";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus, refreshSystemLogs } from "./proxy";
import { refreshAppVersion } from "./app-version";
import { refreshSubscriptions } from "./subscriptions";
import { store, type TabId } from "./state.svelte";

function isLogTab(tab: TabId): boolean {
  return tab === "call-logs" || tab === "system-logs";
}

export function setActiveTab(tab: TabId) {
  if (store.activeTab === tab) return;
  if (isLogTab(store.activeTab) && !isLogTab(tab)) {
    store.proxyLogSelectedId = null;
    store.proxySystemLogSelectedId = null;
  }
  if (store.activeTab === "call-logs" && tab !== "call-logs") {
    store.proxyLogSelectedId = null;
  }
  if (store.activeTab === "system-logs" && tab !== "system-logs") {
    store.proxySystemLogSelectedId = null;
  }
  if (store.activeTab === "settings" && tab !== "settings") {
    store.coreUpdateCheck = null;
    store.appUpdateCheck = null;
  }
  store.activeTab = tab;
  if (tab === "profiles") {
    void (async () => {
      await loadProfilesFromDisk();
      await refreshSubscriptions();
      await detectOllamaInstalled();
    })();
  } else if (tab === "models") {
    void refreshModelList();
  } else {
    void refreshSubscriptions();
  }
  if (tab === "settings") {
    void refreshAppVersion();
    void refreshProxyStatus();
  }
  if (tab === "call-logs") {
    void refreshProxyLogs();
  } else if (tab === "system-logs") {
    void refreshSystemLogs();
  }
}

export function openProxyLog(id: string) {
  const logId = String(id || "").trim();
  if (!logId) return;
  if (!store.proxyLogs.some((entry) => entry.id === logId)) return;
  store.proxyLogSelectedId = logId;
}

export function openProxySystemLog(id: string) {
  const logId = String(id || "").trim();
  if (!logId) return;
  if (!store.proxySystemLogs.some((entry) => entry.id === logId)) return;
  store.proxySystemLogSelectedId = logId;
}

export function closeProxyLog() {
  store.proxyLogSelectedId = null;
  store.proxySystemLogSelectedId = null;
}

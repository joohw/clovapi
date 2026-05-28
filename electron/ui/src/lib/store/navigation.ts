import { resolveVendorByName } from "../helpers";
import { detectCliPath, detectOllamaInstalled } from "./cli";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus } from "./proxy";
import { refreshAppVersion } from "./app-version";
import { refreshSubscriptions } from "./subscriptions";
import { t } from "../i18n";
import { store, type TabId } from "./state.svelte";
import { toast } from "../toast";

function isLogTab(tab: TabId): boolean {
  return tab === "call-logs" || tab === "sessions" || tab === "system-logs";
}

export function setActiveTab(tab: TabId) {
  if (store.activeTab === tab) return;
  if (store.activeTab === "profiles" && tab !== "profiles") {
    store.profilesSelectedVendor = null;
  }
  if (isLogTab(store.activeTab) && !isLogTab(tab)) {
    store.proxyLogSelectedId = null;
    store.proxyLogSelectedSession = null;
    store.proxySystemLogSelectedId = null;
  }
  if (store.activeTab === "call-logs" && tab !== "call-logs") {
    store.proxyLogSelectedId = null;
  }
  if (store.activeTab === "sessions" && tab !== "sessions") {
    store.proxyLogSelectedSession = null;
  }
  if (store.activeTab === "system-logs" && tab !== "system-logs") {
    store.proxySystemLogSelectedId = null;
  }
  if (store.activeTab === "settings" && tab !== "settings") {
    store.coreUpdateCheck = null;
    store.proxyHealthTest = null;
  }
  store.activeTab = tab;
  if (tab === "profiles") {
    void (async () => {
      await loadProfilesFromDisk();
      await refreshSubscriptions();
      await detectOllamaInstalled();
    })();
  } else {
    void refreshSubscriptions();
  }
  if (tab === "cli") {
    void detectCliPath();
  }
  if (tab === "settings") {
    void refreshAppVersion();
    void refreshProxyStatus();
  }
  if (isLogTab(tab)) {
    void refreshProxyLogs();
  }
}

export function openProfilesVendor(vendorName: string) {
  const name = String(vendorName || "").trim();
  if (!name) return;
  const vendor = resolveVendorByName(store.profiles, name);
  if (!vendor) {
    toast.error(t("toast.vendorNotFound"));
    store.profilesSelectedVendor = null;
    return;
  }
  store.profilesSelectedVendor = name;
}

export function closeProfilesVendor() {
  store.profilesSelectedVendor = null;
}

export function openProxyLog(id: string) {
  const logId = String(id || "").trim();
  if (!logId) return;
  if (!store.proxyLogs.some((entry) => entry.id === logId)) return;
  store.proxyLogSelectedId = logId;
}

export function openProxySession(session: string) {
  const key = String(session || "").trim();
  if (!key) return;
  if (!store.proxyLogSessions.some((item) => item.session === key)) return;
  store.proxyLogSelectedSession = key;
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

export function closeProxySession() {
  store.proxyLogSelectedSession = null;
  store.proxyLogSelectedId = null;
}

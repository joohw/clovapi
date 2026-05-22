import { resolveVendorByName } from "../helpers";
import { detectCliPath } from "./cli";
import { loadProfilesFromDisk } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus } from "./proxy";
import { refreshSubscriptions } from "./subscriptions";
import { store, type TabId } from "./state.svelte";
import { toast } from "../toast";

export function setActiveTab(tab: TabId) {
  if (store.activeTab === tab) return;
  if (store.activeTab === "profiles" && tab !== "profiles") {
    store.profilesSelectedVendor = null;
  }
  if (store.activeTab === "logs" && tab !== "logs") {
    store.proxyLogSelectedId = null;
  }
  store.activeTab = tab;
  if (tab === "profiles") {
    void (async () => {
      await loadProfilesFromDisk();
      await refreshSubscriptions();
    })();
  } else {
    void refreshSubscriptions();
  }
  if (tab === "cli") {
    void detectCliPath();
  }
  if (tab === "settings") {
    void refreshProxyStatus();
  }
  if (tab === "logs") {
    void refreshProxyLogs();
  }
}

export function openProfilesVendor(vendorName: string) {
  const name = String(vendorName || "").trim();
  if (!name) return;
  const vendor = resolveVendorByName(store.profiles, name);
  if (!vendor) {
    toast.error("????????");
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

export function closeProxyLog() {
  store.proxyLogSelectedId = null;
}

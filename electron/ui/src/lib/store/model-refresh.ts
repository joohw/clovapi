import {
  getSubscriptionVendors,
  managedVendorList,
} from "../helpers";
import { store } from "./state.svelte";
import { refreshSubscriptionAccountModels } from "./subscriptions";
import { canFetchVendorModels, fetchVendorModels } from "./vendor-models";

const MODEL_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let modelRefreshTimer: number | undefined;
let modelRefreshRunning = false;

async function refreshCachedModels() {
  if (modelRefreshRunning) return;
  modelRefreshRunning = true;
  try {
    const subscriptionVendors = new Map(
      getSubscriptionVendors(store.profiles).map((vendor) => [vendor.name, vendor]),
    );
    for (const vendor of managedVendorList(store.profiles)) {
      if (vendor.kind === "subscription") {
        const subscription = subscriptionVendors.get(vendor.name);
        if (!subscription) continue;
        const hasAccounts = store.subscriptionAccounts.some(
          (account) => account.providerId === subscription.subscriptionProviderId,
        );
        if (hasAccounts) {
          await refreshSubscriptionAccountModels(
            subscription.subscriptionProviderId,
            subscription.name,
          );
        }
        continue;
      }
      if (!canFetchVendorModels(vendor)) continue;
      if (vendor.kind === "local" && !store.ollamaInstalled) continue;
      await fetchVendorModels(vendor.name, { silent: true });
    }
  } finally {
    modelRefreshRunning = false;
  }
}

export function startModelRefreshPolling() {
  if (modelRefreshTimer !== undefined) return;
  void refreshCachedModels();
  modelRefreshTimer = window.setInterval(
    () => void refreshCachedModels(),
    MODEL_REFRESH_INTERVAL_MS,
  );
}

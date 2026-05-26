import {
  getSubscriptionVendors,
  isSubscriptionBinding,
  modelBindingValue,
  normalizeVendor,
  subscriptionProviderFromBinding,
  subscriptionProviderIdsForCli,
} from "../helpers";
import { t } from "../i18n";
import { activeBindingForCli } from "./bindings";
import { clearModelTest } from "./model-tests";
import { runModelTest } from "./model-runner";
import { loadProfilesFromDisk, persistProfiles } from "./profiles";
import { fetchVendorModels } from "./vendor-models";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { SubscriptionItem, SubscriptionVendorRow } from "../../global";

export function subscriptionStatusForProvider(providerId: string): SubscriptionItem | undefined {
  return store.subscriptions.find((s) => s.id === providerId);
}

export function isSubscriptionLogging(providerId: string): boolean {
  return Boolean(store.subscriptionLogging[providerId]);
}

function setSubscriptionLogging(providerId: string, active: boolean) {
  if (active) store.subscriptionLogging[providerId] = true;
  else delete store.subscriptionLogging[providerId];
}

export async function refreshSubscriptions() {
  const bridge = window.clovapiSubscription;
  if (!bridge?.status) return;
  try {
    const result = await bridge.status();
    store.subscriptions = result?.ok && Array.isArray(result.items) ? result.items : [];
  } catch {
    store.subscriptions = [];
  }
}

export async function cancelSubscriptionLogin(providerId: string) {
  const bridge = window.clovapiSubscription;
  if (!bridge?.cancelLogin) return;
  await bridge.cancelLogin(providerId);
  setSubscriptionLogging(providerId, false);
}

export async function runSubscriptionLogin(providerId: string) {
  const bridge = window.clovapiSubscription;
  if (!bridge?.login) {
    toast.error(t("toast.subscriptionLoginUnsupported"));
    return;
  }
  if (isSubscriptionLogging(providerId)) return;

  setSubscriptionLogging(providerId, true);
  const result = await bridge.login(providerId);
  setSubscriptionLogging(providerId, false);
  await refreshSubscriptions();

  if (result?.ok) {
    const vendor = getSubscriptionVendors(store.profiles).find(
      (item) => item.subscriptionProviderId === providerId,
    );
    if (vendor?.name) {
      await fetchVendorModels(vendor.name);
    }
    return;
  }
  if (result?.cancelled) return;
  toast.error(result?.error || t("toast.loginFailed"));
}

export async function runSubscriptionTest(providerId: string) {
  const sub = subscriptionStatusForProvider(providerId);
  if (!sub?.loggedIn) {
    toast.warning(t("toast.loginBeforeTest"));
    return;
  }
  const vendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  if (!vendor?.models?.length) {
    toast.error(t("toast.subscriptionVendorMissing"));
    return;
  }
  await runModelTest(modelBindingValue(providerId, vendor.models[0].id));
}

export async function runSubscriptionLogout(providerId: string, label: string) {
  const bridge = window.clovapiSubscription;
  if (!bridge?.logout) return;
  if (!window.confirm(t("toast.logoutConfirm", { label }))) return;
  const previousVendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  const result = await bridge.logout(providerId);
  if (!result?.ok) {
    toast.error(result?.error || t("toast.logoutFailed"));
    await refreshSubscriptions();
    return;
  }
  if (previousVendor?.models?.length) {
    for (const model of previousVendor.models) {
      clearModelTest(modelBindingValue(providerId, model.id));
    }
  }
  if (Array.isArray(result.profiles)) {
    store.profiles = result.profiles.map(normalizeVendor);
    store.active = result.active && typeof result.active === "object" ? result.active : {};
  } else {
    await loadProfilesFromDisk();
  }

  const vendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  if (vendor?.models?.length) {
    for (const model of vendor.models) {
      clearModelTest(modelBindingValue(providerId, model.id));
    }
  }
  for (const cli of store.clis) {
    if (!subscriptionProviderIdsForCli(cli.kind).includes(providerId)) continue;
    const binding = activeBindingForCli(cli.kind);
    if (
      isSubscriptionBinding(binding, store.profiles) &&
      subscriptionProviderFromBinding(binding, store.profiles) === providerId
    ) {
      delete store.active[cli.kind];
    }
  }
  if (vendor) {
    const vendorIdx = store.profiles.findIndex(
      (item) => item.kind === "subscription" && item.subscriptionProviderId === providerId,
    );
    if (vendorIdx >= 0) {
      store.profiles[vendorIdx] = { ...store.profiles[vendorIdx], models: [] };
    }
  }
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || t("toast.logoutSaveFailed"));
    return;
  }
  await refreshSubscriptions();
}

export function subscriptionVendorRows(): SubscriptionVendorRow[] {
  const vendors = getSubscriptionVendors(store.profiles);
  const byId = new Map(store.subscriptions.map((item) => [item.id, item]));
  return vendors.map((vendor) => {
    const providerId = vendor.subscriptionProviderId;
    const status =
      byId.get(providerId) ||
      ({
        id: providerId,
        label: vendor.name,
        installed: false,
        loggedIn: false,
        summary: t("common.loading"),
      } satisfies SubscriptionItem);
    const modelId = vendor.models[0]?.id || "default";
    return {
      ...status,
      vendor,
      binding: modelBindingValue(providerId, modelId),
    };
  });
}

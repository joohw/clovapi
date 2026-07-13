import {
  getSubscriptionVendors,
  modelBindingValue,
  normalizeRouteBackend,
  normalizeSubscriptionAccount,
  normalizeVendor,
  subscriptionIsUsable,
} from "../helpers";
import { t } from "../i18n";
import { clearModelTest } from "./model-tests";
import { runModelTest } from "./model-runner";
import { loadProfilesFromDisk, persistProfiles } from "./profiles";
import { fetchVendorModels } from "./vendor-models";
import {
  clearSubscriptionAccountUsage,
  clearVendorUsage,
  pruneVendorUsageForSubscriptions,
} from "./vendor-usage";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { RouteBackend, SubscriptionAccount, SubscriptionItem, SubscriptionVendorRow } from "../../global";

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
  const bridge = window.clovapiCli;
  if (!bridge?.authStatus) return;
  try {
    const result = await bridge.authStatus();
    store.subscriptions = result?.ok && Array.isArray(result.items) ? result.items : [];
  } catch {
    store.subscriptions = [];
  }
  pruneVendorUsageForSubscriptions(store.subscriptions);
}

export async function cancelSubscriptionLogin(providerId: string) {
  const bridge = window.clovapiCli;
  if (!bridge?.cancelAuthLogin) return;
  await bridge.cancelAuthLogin(providerId);
  setSubscriptionLogging(providerId, false);
}

export async function runSubscriptionLogin(providerId: string) {
  const bridge = window.clovapiCli;
  if (!bridge?.authLogin) {
    toast.error(t("toast.subscriptionLoginUnsupported"));
    return;
  }
  if (isSubscriptionLogging(providerId)) return;

  setSubscriptionLogging(providerId, true);
  const result = await bridge.authLogin(providerId);
  setSubscriptionLogging(providerId, false);
  await refreshSubscriptions();

  if (result?.ok) {
    const status = subscriptionStatusForProvider(providerId);
    const vendor = getSubscriptionVendors(store.profiles).find(
      (item) => item.subscriptionProviderId === providerId,
    );
    if (vendor?.name && subscriptionIsUsable(status)) {
      await fetchVendorModels(vendor.name);
    }
    return;
  }
  if (result?.cancelled) return;
  toast.error(result?.error || t("toast.loginFailed"));
}

function subscriptionAccountId(providerId: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now());
  return `${providerId}-${suffix}`;
}

function subscriptionCredentialRef(providerId: string, accountId: string): string {
  return `subscription/${providerId}-${accountId}.json`;
}

function subscriptionAccountLabel(providerId: string, index: number): string {
  const vendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  return `${vendor?.name || providerId} ${index + 1}`;
}

export function subscriptionAccountsForProvider(providerId: string): SubscriptionAccount[] {
  return store.subscriptionAccounts
    .map(normalizeSubscriptionAccount)
    .filter((account) => account.providerId === providerId);
}

export async function refreshSubscriptionAccountModels(providerId: string, vendorName: string) {
  const accounts = subscriptionAccountsForProvider(providerId);
  if (!accounts.length) return;

  for (const account of accounts) {
    await fetchVendorModels(vendorName, {
      silent: true,
      credentialRef: account.credentialRef,
    });
  }
}

function nextRouteBackendsForSubscriptionOrder(
  providerId: string,
  accounts: SubscriptionAccount[],
): RouteBackend[] {
  const accountOrder = new Map(accounts.map((account, index) => [account.id, index + 1]));
  return store.routeBackends.map((backend) => {
    const normalized = normalizeRouteBackend(backend);
    if (
      normalized.providerId !== providerId ||
      normalized.sourceType !== "subscription" ||
      !normalized.sourceId ||
      !accountOrder.has(normalized.sourceId)
    ) {
      return normalized;
    }
    return { ...normalized, enabled: true, priority: accountOrder.get(normalized.sourceId) || 0 };
  });
}

async function saveSubscriptionAccounts(providerId: string, accounts: SubscriptionAccount[]) {
  const normalizedAccounts = accounts.map(normalizeSubscriptionAccount);
  store.subscriptionAccounts = [
    ...store.subscriptionAccounts.filter((account) => account.providerId !== providerId),
    ...normalizedAccounts,
  ];
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || t("toast.profilesSaveFailed"));
    return false;
  }
  const orderedBackends = nextRouteBackendsForSubscriptionOrder(providerId, normalizedAccounts);
  if (orderedBackends.some((backend) => backend.providerId === providerId && backend.sourceType === "subscription")) {
    store.routeBackends = orderedBackends;
    const routeSaved = await persistProfiles();
    if (!routeSaved?.ok) {
      toast.error(routeSaved?.error || t("toast.profilesSaveFailed"));
      return false;
    }
  }
  return true;
}

export async function addSubscriptionAccount(providerId: string) {
  const bridge = window.clovapiCli;
  if (!bridge?.authLogin) {
    toast.error(t("toast.subscriptionLoginUnsupported"));
    return;
  }
  if (isSubscriptionLogging(providerId)) return;

  const existing = subscriptionAccountsForProvider(providerId);
  const id = subscriptionAccountId(providerId);
  const credentialRef = subscriptionCredentialRef(providerId, id);
  const account = normalizeSubscriptionAccount({
    id,
    providerId,
    label: subscriptionAccountLabel(providerId, existing.length),
    credentialRef,
    status: "active",
    models: [],
  });

  setSubscriptionLogging(providerId, true);
  const result = await bridge.authLogin({ provider: providerId, credentialRef });
  setSubscriptionLogging(providerId, false);
  await refreshSubscriptions();

  if (!result?.ok) {
    if (!result?.cancelled) toast.error(result?.error || t("toast.loginFailed"));
    return;
  }

  const saved = await saveSubscriptionAccounts(providerId, [...existing, account]);
  if (!saved) return;

  const vendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  if (vendor?.name) await fetchVendorModels(vendor.name, { silent: true, credentialRef });
  toast.success(t("toast.subscriptionAdded"));
}

export async function removeSubscriptionAccount(providerId: string, accountId: string) {
  if (!window.confirm(t("toast.removeSubscriptionConfirm"))) return;
  const remaining = subscriptionAccountsForProvider(providerId).filter(
    (account) => account.id !== accountId,
  );
  if (remaining.length === 0) {
    const vendorIndex = store.profiles.findIndex(
      (vendor) => vendor.kind === "subscription" && vendor.subscriptionProviderId === providerId,
    );
    if (vendorIndex >= 0) {
      store.profiles[vendorIndex] = { ...store.profiles[vendorIndex], models: [] };
    }
  }
  store.routeBackends = store.routeBackends.filter((backend) => backend.sourceId !== accountId);
  clearSubscriptionAccountUsage(accountId);
  const saved = await saveSubscriptionAccounts(providerId, remaining);
  if (saved) toast.success(t("toast.subscriptionRemoved"));
}

export async function reorderSubscriptionAccount(providerId: string, fromIndex: number, toIndex: number) {
  const accounts = subscriptionAccountsForProvider(providerId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= accounts.length || toIndex >= accounts.length) return;
  const [moved] = accounts.splice(fromIndex, 1);
  accounts.splice(toIndex, 0, moved);
  await saveSubscriptionAccounts(providerId, accounts);
}

export async function runSubscriptionTest(providerId: string) {
  const sub = subscriptionStatusForProvider(providerId);
  if (!subscriptionIsUsable(sub)) {
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
  const bridge = window.clovapiCli;
  if (!bridge?.authLogout) return;
  if (!window.confirm(t("toast.logoutConfirm", { label }))) return;
  const previousVendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  if (previousVendor?.name) clearVendorUsage(previousVendor.name);
  const result = await bridge.authLogout(providerId);
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

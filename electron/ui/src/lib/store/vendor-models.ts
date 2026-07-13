import {
  normalizeModelAdapter,
  normalizeVendor,
  normalizeVendorModel,
  normalizeSubscriptionAccount,
  resolveVendorByName,
} from "../helpers";
import { t } from "../i18n";
import { clearVendorModelTests } from "./model-tests";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { Vendor, VendorModel } from "../../global";

export function canFetchVendorModels(vendor: Vendor): boolean {
  return normalizeModelAdapter(vendor.modelAdapter, vendor.kind, vendor.localProvider) !== "manual";
}

export function isVendorFetching(vendorName: string): boolean {
  return Boolean(store.vendorFetching[vendorName]);
}

export async function fetchVendorModels(
  vendorName: string,
  options: { silent?: boolean; credentialRef?: string } = {},
): Promise<VendorModel[] | undefined> {
  const name = String(vendorName || "").trim();
  if (!name || store.vendorFetching[name]) return;

  const vendor = resolveVendorByName(store.profiles, name);
  if (!vendor) {
    if (!options.silent) toast.error(t("toast.vendorNotFound"));
    return;
  }

  if (!canFetchVendorModels(vendor)) {
    if (!options.silent) toast.warning(t("toast.fetchManualAdapter"));
    return;
  }

  const bridge = window.clovapiCli;
  if (!bridge?.profilesListModels) {
    if (!options.silent) toast.error(t("toast.fetchUnsupported"));
    return;
  }

  store.vendorFetching[name] = true;
  try {
    const result = await bridge.profilesListModels(name, options.credentialRef);
    if (!result?.ok) {
      if (!options.silent) toast.error(result?.error || t("toast.fetchFailed"));
      return;
    }

    if (Array.isArray(result.profiles) && result.profiles.length) {
      store.profiles = result.profiles.map(normalizeVendor);
    }
    if (Array.isArray(result.subscriptionAccounts)) {
      store.subscriptionAccounts = result.subscriptionAccounts.map(normalizeSubscriptionAccount);
    }
    const fetched = (result.models || []).map(normalizeVendorModel);
    if (!fetched.length) {
      if (!options.silent) toast.warning(result.message || t("toast.fetchEmpty"));
      return;
    }

    clearVendorModelTests(name);

    const count = fetched.length;
    if (!options.silent) toast.success(t("toast.fetchSuccess", { count }));
    const refreshed = resolveVendorByName(store.profiles, name);
    return fetched.length ? fetched : refreshed?.models;
  } finally {
    delete store.vendorFetching[name];
  }
}

import {
  mergeVendorModels,
  normalizeModelAdapter,
  normalizeVendor,
  normalizeVendorModel,
  resolveVendorByName,
} from "../helpers";
import { t } from "../i18n";
import { persistProfiles } from "./profile-persist";
import { clearVendorModelTests } from "./model-tests";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { Vendor } from "../../global";

export function canFetchVendorModels(vendor: Vendor): boolean {
  return normalizeModelAdapter(vendor.modelAdapter, vendor.kind, vendor.localProvider) !== "manual";
}

export function isVendorFetching(vendorName: string): boolean {
  return Boolean(store.vendorFetching[vendorName]);
}

export async function fetchVendorModels(vendorName: string) {
  const name = String(vendorName || "").trim();
  if (!name || store.vendorFetching[name]) return;

  let vendor = resolveVendorByName(store.profiles, name);
  if (!vendor) {
    toast.error(t("toast.vendorNotFound"));
    return;
  }

  const vendorKey = vendor.name.toLowerCase();
  const vendorKind = vendor.kind;
  let vendorIdx = store.profiles.findIndex(
    (item) => item.name.toLowerCase() === vendorKey && item.kind === vendorKind,
  );
  if (vendorIdx < 0) {
    store.profiles.push(vendor);
    vendorIdx = store.profiles.length - 1;
    const saved = await persistProfiles();
    if (!saved?.ok) {
      toast.error(saved?.error || t("toast.fetchVendorSaveFailed"));
      store.profiles.splice(vendorIdx, 1);
      return;
    }
    vendor = resolveVendorByName(store.profiles, name) || vendor;
    const nextVendorKey = vendor.name.toLowerCase();
    const nextVendorKind = vendor.kind;
    vendorIdx = store.profiles.findIndex(
      (item) => item.name.toLowerCase() === nextVendorKey && item.kind === nextVendorKind,
    );
  }
  if (!canFetchVendorModels(vendor)) {
    toast.warning(t("toast.fetchManualAdapter"));
    return;
  }

  const bridge = window.clovapiCli;
  if (!bridge?.profilesListModels) {
    toast.error(t("toast.fetchUnsupported"));
    return;
  }

  store.vendorFetching[name] = true;
  try {
    const result = await bridge.profilesListModels(name);
    if (!result?.ok) {
      toast.error(result?.error || t("toast.fetchFailed"));
      return;
    }

    if (Array.isArray(result.profiles) && result.profiles.length) {
      store.profiles = result.profiles.map(normalizeVendor);
    } else {
      const fetched = (result.models || []).map(normalizeVendorModel);
      if (!fetched.length) {
        toast.warning(result.message || t("toast.fetchEmpty"));
        return;
      }
      const merged = mergeVendorModels(vendor.models || [], fetched);
      store.profiles[vendorIdx] = { ...vendor, models: merged };
      const saved = await persistProfiles();
      if (!saved?.ok) {
        toast.error(saved?.error || t("toast.profilesSaveFailed"));
        return;
      }
    }

    clearVendorModelTests(name);

    const count = (result.models || []).length;
    toast.success(t("toast.fetchSuccess", { count }));
  } finally {
    delete store.vendorFetching[name];
  }
}

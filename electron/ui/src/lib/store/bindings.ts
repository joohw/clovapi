import {
  activeProviderId,
  activeSelectionKey,
  isBuiltinSubscriptionVendor,
  modelBindingValue,
  parseModelBinding,
  providerIdForVendor,
  resolveVendorByName,
} from "../helpers";
import { clearModelBindingTest } from "./model-tests";
import { store } from "./state.svelte";

export function activeBindingForCli(kind: string): string {
  return activeSelectionKey(store.active[kind]);
}

export function clearModelBinding(vendorName: string, modelId: string) {
  const vendor = resolveVendorByName(store.profiles, vendorName);
  const binding = modelBindingValue(vendor ? providerIdForVendor(vendor) : vendorName, modelId);
  for (const [kind, activeBinding] of Object.entries(store.active)) {
    if (activeSelectionKey(activeBinding) === binding) delete store.active[kind];
  }
  clearModelBindingTest(binding);
}

export function clearVendorBindings(vendorName: string) {
  const key = String(vendorName || "").trim().toLowerCase();
  for (const [kind, binding] of Object.entries(store.active)) {
    const providerId = activeProviderId(binding);
    const vendor = store.profiles.find((item) => providerIdForVendor(item) === providerId);
    if (vendor && vendor.name.toLowerCase() === key) {
      delete store.active[kind];
    }
  }
}

export function isValidModelBinding(binding: string): boolean {
  const key = String(binding || "").trim();
  const parsed = parseModelBinding(key);
  if (!parsed) return false;
  const vendor = store.profiles.find((item) => providerIdForVendor(item) === parsed.providerId);
  if (!vendor) return false;
  const modelId = String(parsed.modelId || "").trim();
  if (!modelId || modelId.toLowerCase() === "default") return false;
  if (vendor.kind === "subscription") {
    return isBuiltinSubscriptionVendor(vendor);
  }
  return Boolean(
    vendor.models?.some(
      (m) =>
        m.id.toLowerCase() === modelId.toLowerCase() ||
        m.model.toLowerCase() === modelId.toLowerCase(),
    ),
  );
}

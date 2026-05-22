import { MODEL_BINDING_PREFIX } from "../constants";
import {
  isBuiltinSubscriptionVendor,
  modelBindingValue,
  parseModelBinding,
  resolveVendorByName,
} from "../helpers";
import { clearModelBindingTest } from "./model-tests";
import { store } from "./state.svelte";

export function activeBindingForCli(kind: string): string {
  return String(store.active[kind] || "").trim();
}

export function clearModelBinding(vendorName: string, modelId: string) {
  const binding = modelBindingValue(vendorName, modelId);
  for (const [kind, activeBinding] of Object.entries(store.active)) {
    if (activeBinding === binding) delete store.active[kind];
  }
  clearModelBindingTest(binding);
}

export function clearVendorBindings(vendorName: string) {
  const key = String(vendorName || "").trim().toLowerCase();
  for (const [kind, binding] of Object.entries(store.active)) {
    const parsed = parseModelBinding(binding);
    if (parsed && parsed.vendorName.toLowerCase() === key) {
      delete store.active[kind];
    }
  }
}

export function isValidModelBinding(binding: string): boolean {
  const key = String(binding || "").trim();
  if (!key.startsWith(MODEL_BINDING_PREFIX)) return false;
  const parsed = parseModelBinding(key);
  if (!parsed) return false;
  const vendor = resolveVendorByName(store.profiles, parsed.vendorName);
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

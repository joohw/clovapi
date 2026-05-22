import {
  canManuallyManageVendorModels,
  isBuiltinCustomApiVendorName,
  isBuiltinSubscriptionVendorName,
  isDefaultCustomApiProfile,
  isDefaultOllamaProfile,
  isOllamaVendor,
  normalizeVendor,
  normalizeVendorModel,
  resolveVendorByName,
} from "../helpers";
import { OLLAMA_DEFAULTS, OLLAMA_PROFILE_NAME } from "../constants";
import { toast } from "../toast";
import { store } from "./state.svelte";
import { clearModelBinding, clearVendorBindings } from "./bindings";
import { persistProfiles } from "./profile-persist";

export { persistProfiles };

export async function loadProfilesFromDisk() {
  const bridge = window.clovapiProfiles;
  if (!bridge?.load) {
    toast.error("????????????? profiles ??????????????");
    return;
  }

  const result = await bridge.load();
  if (!result?.ok) {
    toast.error(result?.error || "???? profiles.json");
    return;
  }

  store.profiles = (result.profiles || []).map(normalizeVendor);
  store.active = result.active && typeof result.active === "object" ? result.active : {};
  if (result.proxy) {
    store.proxyPort = Number(result.proxy.port) || 27483;
    store.proxyBaseUrl = `http://127.0.0.1:${store.proxyPort}`;
  }
  store.profilesPath = result.path || "";

  if (
    !store.profiles.some((p) => isDefaultOllamaProfile(p.name)) ||
    !store.profiles.some((p) => isDefaultCustomApiProfile(p.name))
  ) {
    const resaved = await persistProfiles();
    if (!resaved?.ok) return;
  }
}

function slugModelId(label: string, model: string): string {
  const base = String(label || model || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `model-${Date.now()}`;
}

export function openProfileDialog(_mode: "edit", profileName: string) {
  const profile = resolveVendorByName(store.profiles, profileName);
  if (!profile || !isDefaultOllamaProfile(profile.name)) return;
  store.editingProfileName = profile.name;
  store.profileDialogMode = "edit";
  store.formBaseUrl = profile.baseUrl;
  store.formApiKey = profile.apiKey;
  store.profileDialogOpen = true;
}

export function closeProfileDialog() {
  store.profileDialogOpen = false;
  store.formNameDisabled = false;
}

export function openModelDialog(mode: "create" | "edit", vendorName: string, modelId = "") {
  const vendor = resolveVendorByName(store.profiles, vendorName);
  if (vendor && !canManuallyManageVendorModels(vendor)) {
    toast.warning(
      isOllamaVendor(vendor)
        ? "Ollama ???????????????????"
        : "???????????????????????",
    );
    return;
  }
  store.modelDialogVendorName = vendorName;
  store.modelDialogMode = mode;
  store.editingModelId = mode === "edit" ? modelId : "";
  const stored = store.profiles.find((item) => item.name === vendorName);
  const model = stored?.models.find((item) => item.id === modelId);
  store.formModelLabel = model?.label || "";
  store.formModelName = model?.model || "";
  store.formModelBaseUrl = model?.baseUrl || "";
  store.formModelApiKey = model?.apiKey || "";
  store.formModelApiStyle = model?.apiStyle || "openai-responses";
  store.modelDialogOpen = true;
}

export function closeModelDialog() {
  store.modelDialogOpen = false;
  store.editingModelId = "";
}

export async function saveProfileFromDialog() {
  const editName = store.editingProfileName;
  if (!isDefaultOllamaProfile(editName)) return;

  const baseUrl = store.formBaseUrl.trim() || OLLAMA_DEFAULTS.baseUrl;
  const apiKey = store.formApiKey.trim() || OLLAMA_DEFAULTS.apiKey;
  if (!baseUrl) {
    toast.warning("??????");
    return;
  }

  const existing = resolveVendorByName(store.profiles, editName);
  const payload = normalizeVendor({
    name: OLLAMA_PROFILE_NAME,
    kind: "local",
    localProvider: "ollama",
    modelAdapter: "ollama",
    baseUrl,
    apiKey,
    models: existing?.models || [],
  });

  const existingIdx = store.profiles.findIndex(
    (item) => item.name.toLowerCase() === payload.name.toLowerCase(),
  );
  if (existingIdx >= 0) store.profiles[existingIdx] = payload;
  else store.profiles.push(payload);

  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "?? profiles.json ??");
    return;
  }

  closeProfileDialog();
}

export async function saveModelFromDialog() {
  const vendorName = String(store.modelDialogVendorName || "").trim();
  const label = store.formModelLabel.trim();
  const model = store.formModelName.trim();
  const baseUrl = store.formModelBaseUrl.trim();
  const apiKey = store.formModelApiKey.trim();
  if (!vendorName || !label || !model) {
    toast.warning("?????????? model id?");
    return;
  }

  const vendor = resolveVendorByName(store.profiles, vendorName);
  if (!vendor) {
    toast.error("?????????");
    return;
  }

  const isCustomApi = isDefaultCustomApiProfile(vendor.name);
  if (isCustomApi && (!baseUrl || !apiKey)) {
    toast.warning("??????? API ??? Key?");
    return;
  }

  const vendorIdx = store.profiles.findIndex(
    (item) => item.name.toLowerCase() === vendor.name.toLowerCase() && item.kind === vendor.kind,
  );
  if (vendorIdx < 0) {
    toast.error("?????????");
    return;
  }
  if (!canManuallyManageVendorModels(vendor)) {
    toast.warning(
      isOllamaVendor(vendor)
        ? "Ollama ???????????????????"
        : "???????????????????????",
    );
    return;
  }
  const models = [...(vendor.models || [])];
  const modelId =
    store.modelDialogMode === "edit" && store.editingModelId
      ? store.editingModelId
      : slugModelId(label, model);

  if (
    store.modelDialogMode === "create" &&
    models.some((item) => item.id.toLowerCase() === modelId.toLowerCase())
  ) {
    toast.error(`?? id?\${modelId}?????????????`);
    return;
  }

  const entry = normalizeVendorModel({
    id: modelId,
    label,
    model,
    apiStyle: store.formModelApiStyle,
    baseUrl: isCustomApi ? baseUrl : undefined,
    apiKey: isCustomApi ? apiKey : undefined,
  });

  const idx = models.findIndex((item) => item.id === store.editingModelId);
  if (idx >= 0) models[idx] = entry;
  else models.push(entry);

  store.profiles[vendorIdx] = { ...vendor, models };

  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "??????");
    return;
  }

  closeModelDialog();
}

export async function removeProfile(profileName: string) {
  const key = String(profileName || "").trim();
  if (isDefaultOllamaProfile(key)) {
    toast.warning("Ollama ????????????");
    return;
  }
  if (isBuiltinSubscriptionVendorName(key)) {
    toast.warning("????????????????");
    return;
  }
  if (isBuiltinCustomApiVendorName(key)) {
    toast.warning("??? API ????????????");
    return;
  }
  clearVendorBindings(key);
  store.profiles = store.profiles.filter((item) => item.name.toLowerCase() !== key.toLowerCase());
  if (store.profilesSelectedVendor?.toLowerCase() === key.toLowerCase()) {
    store.profilesSelectedVendor = null;
  }
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "?? profiles.json ??");
  }
}

export async function removeVendorModel(vendorName: string, modelId: string) {
  const vendor = store.profiles.find((item) => item.name === vendorName);
  if (!vendor) return;
  if (isOllamaVendor(vendor)) {
    toast.warning("Ollama ?????????????????");
    return;
  }
  if (isDefaultOllamaProfile(vendorName) && (vendor.models || []).length <= 1) {
    toast.warning("Ollama ?????????");
    return;
  }
  if (vendor.kind === "subscription" && (vendor.models || []).length <= 1) {
    toast.warning("????????????????");
    return;
  }
  clearModelBinding(vendorName, modelId);
  vendor.models = (vendor.models || []).filter((item) => item.id !== modelId);
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "??????");
  }
}

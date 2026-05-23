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
    toast.error("无法加载配置：桌面端未注入 profiles 接口，请重新安装或重启应用。");
    return;
  }

  const result = await bridge.load();
  if (!result?.ok) {
    toast.error(result?.error || "无法读取 profiles.json");
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
        ? "Ollama 仅支持拉取模型，不支持手动添加或编辑。"
        : "官方订阅仅支持拉取模型，不支持手动添加或编辑。",
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
    toast.warning("请填写地址。");
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
    toast.error(saved?.error || "保存 profiles.json 失败");
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
    toast.warning("请填写显示名称和上游 model id。");
    return;
  }

  const vendor = resolveVendorByName(store.profiles, vendorName);
  if (!vendor) {
    toast.error("未找到对应供应商。");
    return;
  }

  const isCustomApi = isDefaultCustomApiProfile(vendor.name);
  if (isCustomApi && (!baseUrl || !apiKey)) {
    toast.warning("请填写该模型的 API 地址与 Key。");
    return;
  }

  const vendorIdx = store.profiles.findIndex(
    (item) => item.name.toLowerCase() === vendor.name.toLowerCase() && item.kind === vendor.kind,
  );
  if (vendorIdx < 0) {
    toast.error("未找到对应供应商。");
    return;
  }
  if (!canManuallyManageVendorModels(vendor)) {
    toast.warning(
      isOllamaVendor(vendor)
        ? "Ollama 仅支持拉取模型，不支持手动添加或编辑。"
        : "官方订阅仅支持拉取模型，不支持手动添加或编辑。",
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
    toast.error(`模型 id「${modelId}」已存在，请修改显示名称。`);
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
    toast.error(saved?.error || "保存模型失败");
    return;
  }

  closeModelDialog();
}

export async function removeProfile(profileName: string) {
  const key = String(profileName || "").trim();
  if (isDefaultOllamaProfile(key)) {
    toast.warning("Ollama 为内置供应商，不可删除。");
    return;
  }
  if (isBuiltinSubscriptionVendorName(key)) {
    toast.warning("官方订阅为内置供应商，不可删除。");
    return;
  }
  if (isBuiltinCustomApiVendorName(key)) {
    toast.warning("自定义 API 为内置供应商，不可删除。");
    return;
  }
  clearVendorBindings(key);
  store.profiles = store.profiles.filter((item) => item.name.toLowerCase() !== key.toLowerCase());
  if (store.profilesSelectedVendor?.toLowerCase() === key.toLowerCase()) {
    store.profilesSelectedVendor = null;
  }
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "保存 profiles.json 失败");
  }
}

export async function removeVendorModel(vendorName: string, modelId: string) {
  const vendor = store.profiles.find((item) => item.name === vendorName);
  if (!vendor) return;
  if (isOllamaVendor(vendor)) {
    toast.warning("Ollama 模型来自拉取列表，不支持手动删除。");
    return;
  }
  if (vendor.kind === "subscription" && (vendor.models || []).length <= 1) {
    toast.warning("官方订阅至少保留一个模型绑定项。");
    return;
  }
  clearModelBinding(vendorName, modelId);
  vendor.models = (vendor.models || []).filter((item) => item.id !== modelId);
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "删除模型失败");
  }
}

import presetTemplate from "../../../preset/api-presets.template.json";
import {
  CUSTOM_API_PROFILE_NAME,
  CUSTOM_PRESET_ID,
  DEFAULT_CLIS,
  DEFAULT_PRESETS,
  MODEL_TEST_STORAGE_KEY,
  OLLAMA_DEFAULTS,
  OLLAMA_PROFILE_NAME,
  TEST_STATUS_STORAGE_KEY,
} from "./constants";
import {
  buildCliBindingOptions,
  canApplyCliBinding,
  findVendorByName,
  formatTestBody,
  getSubscriptionVendors,
  isBuiltinSubscriptionVendorName,
  isBuiltinCustomApiVendorName,
  isDefaultCustomApiProfile,
  isDefaultOllamaProfile,
  isOllamaVendor,
  canManuallyManageVendorModels,
  isModelBinding,
  isSubscriptionBinding,
  modelBindingValue,
  modelTestStatusKey,
  mergeVendorModels,
  normalizeModelAdapter,
  normalizeVendor,
  normalizeVendorModel,
  normalizePreset,
  parseModelBinding,
  resolveVendorByName,
  subscriptionProviderFromBinding,
  subscriptionProviderIdsForCli,
  subscriptionProviderLabel,
  toIpcPayload,
  userVisibleVendors,
} from "./helpers";
import type { CliDef, ModelTestEntry, Preset, SubscriptionItem, SubscriptionVendorRow, Vendor, VendorModel } from "../global";
import { toast } from "./toast";

export type TabId = "cli" | "profiles" | "settings";

export const store = $state({
  activeTab: "cli" as TabId,
  profiles: [] as Vendor[],
  active: {} as Record<string, string>,
  profilesPath: "",
  clis: [...DEFAULT_CLIS] as CliDef[],
  running: false,
  cliDetectedPath: {} as Record<string, string>,
  clovapiAvailable: false,
  editingProfileName: "",
  presets: [...DEFAULT_PRESETS] as Preset[],
  subscriptions: [] as SubscriptionItem[],
  subscriptionLogging: {} as Record<string, boolean>,
  modelTests: {} as Record<string, ModelTestEntry>,
  profileDialogOpen: false,
  profileDialogMode: "create" as "create" | "edit",
  modelDialogOpen: false,
  modelDialogMode: "create" as "create" | "edit",
  modelDialogVendorName: "",
  editingModelId: "",
  presetId: CUSTOM_PRESET_ID,
  formName: "",
  formBaseUrl: "",
  formApiKey: "",
  formModelAdapter: "openai-compatible" as import("../global").ModelAdapterId,
  formNameDisabled: false,
  formModelLabel: "",
  formModelName: "",
  formModelBaseUrl: "",
  formModelApiKey: "",
  formModelApiStyle: "openai-responses",
  proxyRunning: false,
  proxyPort: 27483,
  proxyBaseUrl: "http://127.0.0.1:27483",
  vendorFetching: {} as Record<string, boolean>,
  profilesSelectedVendor: null as string | null,
});

function normalizeModelTestEntry(raw: unknown): ModelTestEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const status = String((raw as ModelTestEntry).status || "").trim();
  if (status !== "testing" && status !== "pass" && status !== "fail") return null;
  return {
    status,
    summary: String((raw as ModelTestEntry).summary || "").trim(),
    detail: String((raw as ModelTestEntry).detail || "").trim(),
  };
}

function loadLegacyTestStatus(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(TEST_STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadModelTests(): Record<string, ModelTestEntry> {
  try {
    const raw = window.localStorage.getItem(MODEL_TEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const out: Record<string, ModelTestEntry> = {};
        for (const [key, value] of Object.entries(parsed)) {
          const entry = normalizeModelTestEntry(value);
          if (entry && entry.status !== "testing") out[key] = entry;
        }
        return out;
      }
    }
  } catch {
    /* fall through to legacy */
  }

  const legacy = loadLegacyTestStatus();
  const out: Record<string, ModelTestEntry> = {};
  for (const [key, value] of Object.entries(legacy)) {
    if (value === "pass" || value === "fail") {
      out[key] = {
        status: value,
        summary: value === "pass" ? "测试成功" : "测试失败",
        detail: "",
      };
    }
  }
  return out;
}

function persistModelTests() {
  try {
    const payload: Record<string, ModelTestEntry> = {};
    for (const [key, entry] of Object.entries(store.modelTests)) {
      if (entry.status === "testing") continue;
      payload[key] = {
        status: entry.status,
        summary: entry.summary,
        detail: "",
      };
    }
    window.localStorage.setItem(MODEL_TEST_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function getModelTest(key: string): ModelTestEntry | undefined {
  const k = String(key || "").trim();
  return k ? store.modelTests[k] : undefined;
}

export function isModelTesting(key: string): boolean {
  return getModelTest(key)?.status === "testing";
}

export function setModelTestTesting(key: string) {
  const k = String(key || "").trim();
  if (!k) return;
  store.modelTests[k] = {
    status: "testing",
    summary: "测试中…",
    detail: "",
  };
}

export function setModelTestResult(
  key: string,
  passed: boolean,
  summary: string,
  detail: string,
) {
  const k = String(key || "").trim();
  if (!k) return;
  store.modelTests[k] = {
    status: passed ? "pass" : "fail",
    summary: summary || (passed ? "测试成功" : "测试失败"),
    detail: detail || "",
  };
  persistModelTests();
}

export function clearModelTest(key: string) {
  const k = String(key || "").trim();
  if (!k || !(k in store.modelTests)) return;
  delete store.modelTests[k];
  persistModelTests();
}

function clearVendorModelTests(vendorName: string) {
  const key = String(vendorName || "").trim().toLowerCase();
  if (!key) return;
  let changed = false;
  for (const testKey of Object.keys(store.modelTests)) {
    const parsed = parseModelBinding(testKey);
    if (parsed && parsed.vendorName.toLowerCase() === key) {
      delete store.modelTests[testKey];
      changed = true;
    }
  }
  if (changed) persistModelTests();
}

function slugModelId(label: string, model: string): string {
  const base = String(label || model || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `model-${Date.now()}`;
}

function renameVendorBindings(oldName: string, newName: string) {
  const oldKey = String(oldName || "").trim().toLowerCase();
  const next = String(newName || "").trim();
  if (!oldKey || !next || oldKey === next.toLowerCase()) return;
  for (const [kind, binding] of Object.entries(store.active)) {
    const parsed = parseModelBinding(binding);
    if (parsed && parsed.vendorName.toLowerCase() === oldKey) {
      store.active[kind] = modelBindingValue(next, parsed.modelId);
    }
  }
}

function clearVendorBindings(vendorName: string) {
  const key = String(vendorName || "").trim().toLowerCase();
  for (const [kind, binding] of Object.entries(store.active)) {
    const parsed = parseModelBinding(binding);
    if (parsed && parsed.vendorName.toLowerCase() === key) {
      delete store.active[kind];
    }
  }
}

function clearModelBinding(vendorName: string, modelId: string) {
  const binding = modelBindingValue(vendorName, modelId);
  for (const [kind, activeBinding] of Object.entries(store.active)) {
    if (activeBinding === binding) delete store.active[kind];
  }
  clearModelTest(modelTestStatusKey(binding));
}

export async function persistProfiles() {
  const bridge = window.clovapiProfiles;
  if (!bridge?.save) return { ok: false, error: "Profile bridge unavailable" };
  const result = await bridge.save({
    profiles: store.profiles,
    active: store.active,
    proxy: {
      enabled: true,
      host: "127.0.0.1",
      port: store.proxyPort,
    },
  });
  if (result?.ok) {
    store.profiles = (result.profiles || []).map(normalizeVendor);
    store.active = result.active && typeof result.active === "object" ? result.active : {};
    if (result.proxy) {
      store.proxyPort = Number(result.proxy.port) || 27483;
      store.proxyBaseUrl = `http://127.0.0.1:${store.proxyPort}`;
    }
    if (result.path) store.profilesPath = result.path;
  }
  return result;
}

export async function loadProfilesFromDisk() {
  const bridge = window.clovapiProfiles;
  if (!bridge?.load) {
    toast.error("无法加载配置：桌面端未注入 profiles 接口，请重新安装或重启应用。");
    return;
  }

  let result = await bridge.load();
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

export async function refreshProxyStatus() {
  const bridge = window.clovapiProxy;
  if (!bridge?.status) return;
  try {
    const result = await bridge.status();
    if (result?.ok) {
      store.proxyRunning = Boolean(result.running);
      store.proxyPort = Number(result.port) || store.proxyPort;
      store.proxyBaseUrl = result.baseUrl || `http://127.0.0.1:${store.proxyPort}`;
    }
  } catch {
    store.proxyRunning = false;
  }
}

export async function restartLocalProxy() {
  const bridge = window.clovapiProxy;
  if (!bridge?.stop || !bridge?.start) {
    toast.error("当前环境不支持本地代理");
    return;
  }
  await bridge.stop();
  const result = await bridge.start(store.proxyPort);
  await refreshProxyStatus();
  if (result?.ok) toast.success("本地代理已重启");
  else toast.error(result?.error || "本地代理重启失败");
}

export async function loadPresets() {
  try {
    const data = presetTemplate as { presets?: Partial<Preset>[] };
    if (!Array.isArray(data?.presets)) throw new Error("invalid preset schema");
    const presets = data.presets.map(normalizePreset).filter((item) => item.id);
    const hasCustom = presets.some((item) => item.id === CUSTOM_PRESET_ID);
    store.presets = hasCustom ? presets : [DEFAULT_PRESETS[0], ...presets];
  } catch {
    store.presets = [...DEFAULT_PRESETS];
  }
  store.presetId = CUSTOM_PRESET_ID;
}

export function applyPresetToForm(presetId: string) {
  const preset = store.presets.find((item) => item.id === presetId);
  if (!preset) return;
  store.formName = preset.apiName || "";
  store.formBaseUrl = preset.baseUrl || "";
  store.formModelAdapter = preset.modelAdapter || "openai-compatible";
}

export function applyPresetToModelForm(presetId: string) {
  const preset = store.presets.find((item) => item.id === presetId);
  if (!preset) return;
  store.formModelName = preset.defaultModel || "";
  store.formModelLabel = preset.defaultModel || "";
  store.formModelBaseUrl = preset.baseUrl || "";
  store.formModelApiStyle = preset.apiStyle || "openai-responses";
}

export function activeBindingForCli(kind: string): string {
  return String(store.active[kind] || "").trim();
}

export function subscriptionStatusForProvider(providerId: string): SubscriptionItem | undefined {
  return store.subscriptions.find((s) => s.id === providerId);
}

export function setRunning(running: boolean) {
  store.running = running;
}

function isSubscriptionLogging(providerId: string): boolean {
  return Boolean(store.subscriptionLogging[providerId]);
}

function setSubscriptionLogging(providerId: string, active: boolean) {
  if (active) store.subscriptionLogging[providerId] = true;
  else delete store.subscriptionLogging[providerId];
}

export function setActiveTab(tab: TabId) {
  if (store.activeTab === tab) return;
  if (store.activeTab === "profiles" && tab !== "profiles") {
    store.profilesSelectedVendor = null;
  }
  store.activeTab = tab;
  void refreshSubscriptions();
  if (tab === "cli") {
    void detectCliPath();
  }
  if (tab === "settings") {
    void refreshProxyStatus();
  }
}

export function openProfilesVendor(vendorName: string) {
  const name = String(vendorName || "").trim();
  if (!name) return;
  const vendor = resolveVendorByName(store.profiles, name);
  if (!vendor) {
    toast.error("未找到该供应商。");
    store.profilesSelectedVendor = null;
    return;
  }
  store.profilesSelectedVendor = name;
}

export function closeProfilesVendor() {
  store.profilesSelectedVendor = null;
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
    (item) =>
      item.name.toLowerCase() === vendor.name.toLowerCase() && item.kind === vendor.kind,
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
  if (isDefaultOllamaProfile(vendorName) && (vendor.models || []).length <= 1) {
    toast.warning("Ollama 至少保留一个模型。");
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
    toast.error("未找到对应供应商。");
    return;
  }

  let vendorIdx = store.profiles.findIndex(
    (item) =>
      item.name.toLowerCase() === vendor.name.toLowerCase() &&
      item.kind === vendor.kind,
  );
  if (vendorIdx < 0) {
    store.profiles.push(vendor);
    vendorIdx = store.profiles.length - 1;
    const saved = await persistProfiles();
    if (!saved?.ok) {
      toast.error(saved?.error || "保存供应商配置失败");
      store.profiles.splice(vendorIdx, 1);
      return;
    }
    vendor = resolveVendorByName(store.profiles, name) || vendor;
    vendorIdx = store.profiles.findIndex(
      (item) =>
        item.name.toLowerCase() === vendor.name.toLowerCase() &&
        item.kind === vendor.kind,
    );
  }
  if (!canFetchVendorModels(vendor)) {
    toast.warning("当前适配器为手动维护，请在编辑供应商中切换适配器后再拉取。");
    return;
  }

  const bridge = window.clovapiProfiles;
  if (!bridge?.listModels) {
    toast.error("当前环境不支持拉取模型。");
    return;
  }

  store.vendorFetching[name] = true;
  try {
    const result = await bridge.listModels(name);
    if (!result?.ok) {
      toast.error(result?.error || "拉取模型失败");
      return;
    }

    if (Array.isArray(result.profiles) && result.profiles.length) {
      store.profiles = result.profiles.map(normalizeVendor);
    } else {
      const fetched = (result.models || []).map(normalizeVendorModel);
      if (!fetched.length) {
        toast.warning(result.message || "未拉取到任何模型");
        return;
      }
      const merged = mergeVendorModels(vendor.models || [], fetched);
      store.profiles[vendorIdx] = { ...vendor, models: merged };
      const saved = await persistProfiles();
      if (!saved?.ok) {
        toast.error(saved?.error || "保存模型列表失败");
        return;
      }
    }

    clearVendorModelTests(name);

    const count = (result.models || []).length;
    toast.success(`已拉取 ${count} 个模型`);
  } finally {
    delete store.vendorFetching[name];
  }
}

export async function onCliBindingChange(cli: CliDef, value: string) {
  const binding = String(value || "").trim();
  if (!binding) delete store.active[cli.kind];
  else store.active[cli.kind] = binding;
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "保存绑定失败");
  }
}

export async function detectCliPath() {
  const bridge = window.clovapiCli;
  if (!bridge?.which) return;
  const next: Record<string, string> = {};
  for (const cli of store.clis) {
    try {
      const result = await bridge.which(cli.command);
      next[cli.id] = result?.exists ? result.path || "available" : "";
    } catch {
      next[cli.id] = "";
    }
  }
  store.cliDetectedPath = next;
}

async function runClovapiArgs(args: string[]) {
  const bridge = window.clovapiCli;
  if (!bridge?.runClovapi) {
    toast.error("当前环境无法调用 clovapi");
    return { ok: false };
  }
  const cwdRes = await bridge.defaultCwd().catch(() => ({ cwd: "" }));
  const result = await bridge.runClovapi(args, cwdRes.cwd || "");
  if (!result?.ok) {
    toast.error(result?.error || "clovapi 启动失败");
    setRunning(false);
    return result;
  }
  setRunning(true);
  return result;
}

function waitForCliExit() {
  const bridge = window.clovapiCli;
  if (!bridge?.onExit) {
    return Promise.resolve({ ok: true, code: 0 });
  }
  return new Promise<{ ok: boolean; code?: number | null }>((resolve) => {
    const off = bridge.onExit((payload) => {
      if (typeof off === "function") off();
      const code = payload?.code;
      resolve({ ok: code === 0 || code === null, code });
    });
  });
}

async function runClovapiArgsAndWait(args: string[]) {
  const started = await runClovapiArgs(args);
  if (!started?.ok) return started;
  const exit = await waitForCliExit();
  setRunning(false);
  return exit;
}

export async function runModelTest(binding: string) {
  const key = String(binding || "").trim();
  if (!key) return;

  const bridge = window.clovapiProfiles;
  if (!bridge?.test) {
    toast.error("当前环境不支持 API 测试");
    return;
  }

  const statusKey = modelTestStatusKey(key);
  if (isModelTesting(statusKey)) return;

  setModelTestTesting(statusKey);

  const TEST_UI_TIMEOUT_MS = 130_000;
  let result: Awaited<ReturnType<NonNullable<typeof bridge.test>>>;
  try {
    result = await Promise.race([
      bridge.test(
        toIpcPayload({
          binding: key,
          vendors: store.profiles,
          active: store.active,
          proxy: { enabled: true, host: "127.0.0.1", port: store.proxyPort },
        }),
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`测试超时（${TEST_UI_TIMEOUT_MS / 1000}s 无响应）`)), TEST_UI_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "API 测试失败";
    setModelTestResult(statusKey, false, "测试失败", message);
    return;
  }

  const detail = formatTestBody(result);
  const passed = Boolean(result?.passed);
  const summary = result?.summary || (passed ? "测试成功" : "测试失败");

  setModelTestResult(statusKey, passed, summary, passed ? "" : detail);
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
    toast.error("当前环境不支持订阅登录");
    return;
  }
  if (isSubscriptionLogging(providerId)) return;

  setSubscriptionLogging(providerId, true);
  const result = await bridge.login(providerId);
  setSubscriptionLogging(providerId, false);
  await refreshSubscriptions();

  if (result?.ok) return;
  if (result?.cancelled) return;
  toast.error(result?.error || "登录失败");
}

export async function runSubscriptionTest(providerId: string) {
  const sub = subscriptionStatusForProvider(providerId);
  if (!sub?.loggedIn) {
    toast.warning("请先完成登录后再测试。");
    return;
  }
  const vendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  if (!vendor?.models?.length) {
    toast.error("未找到订阅供应商。");
    return;
  }
  await runModelTest(modelBindingValue(vendor.name, vendor.models[0].id));
}

export async function runSubscriptionLogout(providerId: string, label: string) {
  const bridge = window.clovapiSubscription;
  if (!bridge?.logout) return;
  if (!window.confirm(`确定退出「${label}」？将删除本地 OAuth 凭据文件。`)) return;
  const result = await bridge.logout(providerId);
  const vendor = getSubscriptionVendors(store.profiles).find(
    (item) => item.subscriptionProviderId === providerId,
  );
  if (vendor?.models?.length) {
    for (const model of vendor.models) {
      clearModelTest(modelBindingValue(vendor.name, model.id));
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
  await persistProfiles();
  await refreshSubscriptions();
  if (!result?.ok) {
    toast.error(result?.error || "退出失败");
  }
}

export async function runCliApply(cli: CliDef) {
  const binding = activeBindingForCli(cli.kind);

  if (!store.clovapiAvailable) {
    toast.error("应用失败");
    return;
  }

  if (!binding) {
    const exit = await runClovapiArgsAndWait(["switch", "--cli", cli.kind, "--reset"]);
    if (!exit?.ok) {
      toast.error("恢复默认失败");
      return;
    }
    delete store.active[cli.kind];
    const saved = await persistProfiles();
    if (!saved?.ok) {
      toast.error("保存配置失败");
      return;
    }
    toast.success("已恢复默认");
    return;
  }

  if (isSubscriptionBinding(binding, store.profiles)) {
    const providerId = subscriptionProviderFromBinding(binding, store.profiles);
    const sub = subscriptionStatusForProvider(providerId);
    if (!sub?.loggedIn) {
      toast.warning(`请先在 API 管理 → ${subscriptionProviderLabel(providerId)} 中完成登录。`);
      return;
    }
  }

  if (!store.clovapiAvailable) {
    toast.error("应用失败");
    return;
  }

  const proxyBridge = window.clovapiProxy;
  if (!proxyBridge?.ensureStub) {
    toast.error("应用失败");
    return;
  }

  const stubResult = await proxyBridge.ensureStub(cli.kind, binding);
  if (!stubResult?.ok || !stubResult.stubName) {
    toast.error("应用失败");
    return;
  }
  await refreshProxyStatus();

  const exit = await runClovapiArgsAndWait(["switch", "--cli", cli.kind, stubResult.stubName]);
  if (!exit?.ok) {
    toast.error("应用失败");
    return;
  }

  store.active[cli.kind] = binding;
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error("应用失败");
    return;
  }
  toast.success("应用成功");
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
        summary: "加载中…",
      } satisfies SubscriptionItem);
    const modelId = vendor.models[0]?.id || "default";
    return {
      ...status,
      vendor,
      binding: modelBindingValue(vendor.name, modelId),
    };
  });
}

export function cliApplyTitle(cli: CliDef): string {
  const binding = activeBindingForCli(cli.kind);
  if (!store.clovapiAvailable) return "需要安装 clovapi CLI";
  if (!String(binding || "").trim()) return "恢复 CLI 默认配置（清除 clovapi 代理绑定）";
  if (!store.proxyRunning) return "本地代理未运行，应用时将自动启动";
  if (
    isSubscriptionBinding(binding, store.profiles) &&
    !canApplyCliBinding(binding, store.clovapiAvailable, store.subscriptions, store.profiles)
  ) {
    return "请先在 API 管理完成订阅供应商登录";
  }
  return "通过本地代理应用绑定";
}

export { isSubscriptionLogging, buildCliBindingOptions, canApplyCliBinding, userVisibleVendors };

export async function initApp() {
  store.modelTests = loadModelTests();
  await loadPresets();
  await loadProfilesFromDisk();
  await refreshSubscriptions();
  await refreshProxyStatus();

  const bridge = window.clovapiCli;
  if (bridge) {
    bridge.onExit(() => setRunning(false));
    const runState = await bridge.state().catch(() => ({ running: false }));
    setRunning(Boolean(runState?.running));
    const tool = await bridge.toolStatus?.().catch(() => null);
    store.clovapiAvailable = Boolean(tool?.available);
    await detectCliPath();
  }
}

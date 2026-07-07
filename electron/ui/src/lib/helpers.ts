import {
  adapterMessageKey,
  displayVendorName,
  formatSubscriptionSummary,
  t,
} from "./i18n";
import {
  INTERNAL_PROFILE_PREFIX,
  MODEL_ADAPTER_IDS,
  CUSTOM_API_PROFILE_NAME,
  FIXED_PROVIDER_IDS,
  OLLAMA_DEFAULTS,
  OLLAMA_PROFILE_NAME,
  SUBSCRIPTION_VENDOR_DEFS,
} from "./constants";
import type { FixedProviderId } from "./constants";
import type {
  ActiveSelection,
  ModelAdapterId,
  Preset,
  SubscriptionItem,
  Vendor,
  VendorKind,
  VendorModel,
} from "../global";

export function isDefaultOllamaProfile(name: string): boolean {
  return String(name || "").trim().toLowerCase() === OLLAMA_PROFILE_NAME.toLowerCase();
}

export function isDefaultCustomApiProfile(name: string): boolean {
  return String(name || "").trim().toLowerCase() === CUSTOM_API_PROFILE_NAME.toLowerCase();
}

export function isBuiltinCustomApiVendorName(name: string): boolean {
  return isDefaultCustomApiProfile(name);
}

export function getCustomApiVendor(vendors: Vendor[]): Vendor {
  const found = vendors.find(
    (vendor) =>
      vendor.kind === "api" && vendor.name.toLowerCase() === CUSTOM_API_PROFILE_NAME.toLowerCase(),
  );
  if (found) return found;
  return normalizeVendor({
    name: CUSTOM_API_PROFILE_NAME,
    kind: "api",
    modelAdapter: "manual",
    baseUrl: "",
    apiKey: "",
    models: [],
  });
}

export function isOllamaVendor(vendor: Vendor): boolean {
  return (
    vendor.kind === "local" &&
    isDefaultOllamaProfile(vendor.name) &&
    String(vendor.localProvider || "ollama").trim().toLowerCase() === "ollama"
  );
}

/** 订阅与 Ollama 的模型列表仅通过「拉取模型」维护。 */
export function canManuallyManageVendorModels(vendor: Vendor): boolean {
  if (vendor.kind === "subscription") return false;
  if (isOllamaVendor(vendor)) return false;
  return true;
}

export function isBuiltinSubscriptionVendor(vendor: Vendor): boolean {
  if (vendor.kind !== "subscription") return false;
  const providerId = String(vendor.subscriptionProviderId || "").trim();
  return SUBSCRIPTION_VENDOR_DEFS.some((def) => def.subscriptionProviderId === providerId);
}

export function isBuiltinSubscriptionVendorName(name: string): boolean {
  const key = String(name || "").trim().toLowerCase();
  return SUBSCRIPTION_VENDOR_DEFS.some((def) => def.name.toLowerCase() === key);
}

export function isBuiltinVendorName(name: string): boolean {
  return (
    isBuiltinSubscriptionVendorName(name) ||
    isDefaultOllamaProfile(name) ||
    isDefaultCustomApiProfile(name)
  );
}

export function findVendorByName(vendors: Vendor[], name: string): Vendor | undefined {
  const key = String(name || "").trim().toLowerCase();
  return vendors.find((vendor) => vendor.name.toLowerCase() === key);
}

export function getOllamaVendor(vendors: Vendor[]): Vendor {
  const found = vendors.find(
    (vendor) => vendor.name.toLowerCase() === OLLAMA_PROFILE_NAME.toLowerCase(),
  );
  if (found) return found;
  return normalizeVendor({
    name: OLLAMA_PROFILE_NAME,
    kind: "local",
    localProvider: "ollama",
    modelAdapter: "ollama",
    baseUrl: OLLAMA_DEFAULTS.baseUrl,
    apiKey: OLLAMA_DEFAULTS.apiKey,
    models: [],
  });
}

export function getSubscriptionVendors(vendors: Vendor[]): Vendor[] {
  return SUBSCRIPTION_VENDOR_DEFS.map((def) => {
    const found = vendors.find(
      (vendor) =>
        vendor.kind === "subscription" &&
        vendor.subscriptionProviderId === def.subscriptionProviderId,
    );
    if (found) return found;
    return normalizeVendor({
      name: def.name,
      kind: "subscription",
      subscriptionProviderId: def.subscriptionProviderId,
      modelAdapter: "subscription",
      models: [],
    });
  });
}

export function isInternalProfileName(name: string): boolean {
  return String(name || "").startsWith(INTERNAL_PROFILE_PREFIX);
}

export function userVisibleVendors(vendors: Vendor[]): Vendor[] {
  return vendors.filter((vendor) => !isInternalProfileName(vendor.name));
}

export function isFixedProviderId(providerId: string): providerId is FixedProviderId {
  return (FIXED_PROVIDER_IDS as readonly string[]).includes(String(providerId || "").trim());
}

/** Local proxy ingress base URL: http://{host}:{port}/{providerId}/v1 */
export function buildProxyIngressBaseURL(port: number, providerId: string, host = "127.0.0.1"): string {
  const id = String(providerId || "").trim();
  if (!id) return "";
  const p = Number(port) > 0 ? Number(port) : 27483;
  const h = String(host || "").trim() || "127.0.0.1";
  return `http://${h}:${p}/${id}/v1`;
}

export function providerIdForVendor(vendor: Vendor): FixedProviderId | "" {
  if (vendor.kind === "subscription") {
    const subId = String(vendor.subscriptionProviderId || "").trim();
    if (subId === "claude-code" || subId === "codex") return subId;
  }
  if (vendor.kind === "local" && isDefaultOllamaProfile(vendor.name)) return "ollama";
  if (vendor.kind === "api" && isDefaultCustomApiProfile(vendor.name)) return "custom-api";
  return "";
}

/** 固定四个内置供应商：两个订阅、Ollama、自定义 API（不可动态注册）。 */
export function managedVendorList(vendors: Vendor[]): Vendor[] {
  return [...getSubscriptionVendors(vendors), getOllamaVendor(vendors), getCustomApiVendor(vendors)];
}

export function subscriptionTestStatusKey(providerId: string): string {
  return modelBindingValue(providerId, "default");
}

export function activeProviderId(value: ActiveSelection | string | undefined): string {
  if (typeof value === "string") return parseModelBinding(value)?.providerId || "";
  return String(value?.provider_id || value?.providerId || "").trim();
}

export function activeModelId(value: ActiveSelection | string | undefined): string {
  if (typeof value === "string") return parseModelBinding(value)?.modelId || "";
  return String(value?.model_id || value?.modelId || "").trim();
}

export function activeSelectionKey(value: ActiveSelection | string | undefined): string {
  const providerId = activeProviderId(value);
  const modelId = activeModelId(value);
  return providerId && modelId ? `${providerId}/${modelId}` : "";
}

export function modelBindingValue(vendorName: string, modelId: string): string {
  return `${String(vendorName || "").trim()}/${String(modelId || "").trim()}`;
}

export function parseModelBinding(value: string): { providerId: string; modelId: string; vendorName: string } | null {
  let rest = String(value || "").trim();
  if (!rest) return null;
  if (rest.startsWith("@model:")) rest = rest.slice("@model:".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const providerId = rest.slice(0, slash);
  return { providerId, vendorName: providerId, modelId: rest.slice(slash + 1) };
}

export function modelTestStatusKey(binding: ActiveSelection | string): string {
  return activeSelectionKey(binding);
}

export function normalizeModelAdapter(
  raw: unknown,
  kind: VendorKind = "api",
  localProvider = "",
): ModelAdapterId {
  const id = String(raw || "").trim();
  if (kind === "subscription") return "subscription";
  if (MODEL_ADAPTER_IDS.includes(id as ModelAdapterId)) return id as ModelAdapterId;
  if (kind === "local" && String(localProvider || "ollama").toLowerCase() === "ollama") {
    return "ollama";
  }
  return "openai-compatible";
}

export function modelAdapterLabel(adapterId: string): string {
  const keys = adapterMessageKey(adapterId);
  if (keys.label) return t(keys.label);
  return adapterId || "—";
}

export function vendorAdapterLine(vendor: Vendor): string {
  if (vendor.kind === "subscription") {
    return t("vendorKind.subscriptionOAuth");
  }
  if (isDefaultCustomApiProfile(vendor.name)) {
    return t("vendorKind.customPerModel");
  }
  return `${vendor.baseUrl} · ${modelAdapterLabel(vendor.modelAdapter)}`;
}

export function mergeVendorModels(existing: VendorModel[], fetched: VendorModel[]): VendorModel[] {
  const map = new Map(existing.map((item) => [item.id.toLowerCase(), normalizeVendorModel(item)]));
  for (const raw of fetched) {
    const incoming = normalizeVendorModel(raw);
    const key = incoming.id.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        ...prev,
        model: incoming.model,
        label: prev.label || incoming.label,
        apiStyle: prev.apiStyle || incoming.apiStyle,
        baseUrl: incoming.baseUrl || prev.baseUrl,
        apiKey: incoming.apiKey || prev.apiKey,
      });
    } else {
      map.set(key, incoming);
    }
  }
  return Array.from(map.values());
}

export function vendorKindLabel(vendor: Vendor): string {
  if (vendor.kind === "subscription") return t("vendorKind.subscription");
  if (vendor.kind === "local") {
    const provider = vendor.localProvider || "ollama";
    return provider === "ollama" ? "Ollama" : t("vendorKind.local", { provider });
  }
  if (isDefaultCustomApiProfile(vendor.name)) return displayVendorName(vendor.name);
  return t("vendorKind.api");
}

export function resolveVendorByName(vendors: Vendor[], name: string): Vendor | undefined {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return undefined;
  if (key === OLLAMA_PROFILE_NAME.toLowerCase()) {
    return getOllamaVendor(vendors);
  }
  if (key === CUSTOM_API_PROFILE_NAME.toLowerCase()) {
    return getCustomApiVendor(vendors);
  }
  const subscription = getSubscriptionVendors(vendors).find((vendor) => vendor.name.toLowerCase() === key);
  if (subscription) return subscription;
  return findVendorByName(vendors, name);
}

export function vendorSummaryLine(
  vendor: Vendor,
  subscription?: SubscriptionItem,
  ollamaInstalled = false,
): string {
  const count =
    vendor.kind === "subscription" && !subscriptionIsUsable(subscription)
      ? 0
      : isOllamaVendor(vendor) && !ollamaInstalled
        ? 0
      : vendor.models?.length || 0;
  const models = t("vendorDetail.modelCount", { count });
  if (vendor.kind === "subscription") {
    const status = formatSubscriptionSummary(subscription?.summary || "");
    return `${status} · ${models}`;
  }
  if (isOllamaVendor(vendor)) {
    const install = ollamaInstalled ? t("vendorDetail.installed") : t("vendorDetail.notInstalled");
    return `${install} · ${models}`;
  }
  if (isDefaultCustomApiProfile(vendor.name)) {
    return models;
  }
  return `${vendorKindLabel(vendor)} · ${vendorAdapterLine(vendor)} · ${models}`;
}

export function modelBindingLabel(vendor: Vendor, model: VendorModel): string {
  const kind = vendorKindLabel(vendor);
  if (vendor.kind === "subscription") {
    const modelName = String(model.label || model.model || model.id || "").trim() || "—";
    return `${displayVendorName(vendor.name)} · ${modelName}`;
  }
  if (isDefaultCustomApiProfile(vendor.name)) {
    const url = String(model.baseUrl || "").trim() || t("vendorDetail.addressNotConfigured");
    return `${kind} · ${model.label || model.model} · ${url}`;
  }
  return `${kind} · ${displayVendorName(vendor.name)} · ${model.label || model.model} · ${model.apiStyle}`;
}

export function customApiModelLine(model: VendorModel): string {
  const url = String(model.baseUrl || "").trim() || t("vendorDetail.addressNotConfigured");
  return `${model.model} · ${model.apiStyle} · ${url}`;
}

export function normalizeApiStyle(raw: unknown): string {
  const style = String(raw || "").trim().toLowerCase();
  if (style === "message" || style === "claude" || style === "anthropic" || style === "messages") {
    return "message";
  }
  if (style === "chat" || style === "openai-chat") return "chat";
  if (style === "responses" || style === "openai-responses" || style === "openai") return "responses";
  if (style === "gemini") return "gemini";
  return "chat";
}

export function normalizeVendorModel(input: Partial<VendorModel>): VendorModel {
  const model = String(input?.model || "").trim();
  const id = String(input?.id || "").trim() || "default";
  return {
    id,
    label: String(input?.label || "").trim() || model || id,
    model: model || id,
    apiStyle: normalizeApiStyle(input?.apiStyle),
    baseUrl: String(input?.baseUrl || "").trim(),
    apiKey: String(input?.apiKey || "").trim(),
  };
}

export function normalizeVendor(input: Partial<Vendor>): Vendor {
  const kindRaw = String(input?.kind || "api").trim().toLowerCase();
  const kind: VendorKind =
    kindRaw === "local" || kindRaw === "subscription" ? kindRaw : "api";
  const models = Array.isArray(input?.models) ? input.models.map(normalizeVendorModel) : [];
  return {
    name: String(input?.name || "").trim(),
    kind,
    localProvider: String(input?.localProvider || "").trim(),
    subscriptionProviderId: String(input?.subscriptionProviderId || "").trim(),
    modelAdapter: normalizeModelAdapter(input?.modelAdapter, kind, input?.localProvider),
    baseUrl: String(input?.baseUrl || "").trim(),
    apiKey: String(input?.apiKey || ""),
    usageQuery:
      kind === "api"
        ? {
            enabled: input?.usageQuery?.enabled !== false,
            templateType: String(input?.usageQuery?.templateType || "auto").trim() || "auto",
            autoIntervalMinutes: Number(input?.usageQuery?.autoIntervalMinutes || 0) || 0,
          }
        : undefined,
    usage: input?.usage,
    models,
  };
}

export function normalizePreset(input: Partial<Preset>): Preset {
  const id = String(input?.id || "").trim();
  return {
    id: id || `preset-${Date.now()}`,
    apiName: String(input?.apiName || "").trim(),
    baseUrl: String(input?.baseUrl || "").trim(),
    apiStyle: normalizeApiStyle(input?.apiStyle || "responses"),
    defaultModel: String(input?.defaultModel || "").trim(),
    modelAdapter: normalizeModelAdapter(input?.modelAdapter),
  };
}

export function subscriptionProviderLabel(providerId: string): string {
  const stored =
    SUBSCRIPTION_VENDOR_DEFS.find((item) => item.subscriptionProviderId === providerId)?.name ||
    providerId;
  return displayVendorName(stored);
}

export function subscriptionStatusForVendor(
  vendor: Vendor,
  subscriptions: SubscriptionItem[],
): SubscriptionItem | undefined {
  if (vendor.kind !== "subscription") return undefined;
  const providerId = String(vendor.subscriptionProviderId || "").trim();
  if (!providerId) return undefined;
  return (
    subscriptions.find((item) => item.id === providerId) || {
      id: providerId,
      label: vendor.name,
      installed: false,
      loggedIn: false,
      summary: t("common.loading"),
    }
  );
}

export function subscriptionIsUsable(subscription: SubscriptionItem | undefined): boolean {
  if (!subscription?.loggedIn) return false;
  return subscription.active !== false;
}

/** Whether vendor quota/balance should be queried or shown in the UI. */
export function shouldShowVendorUsage(vendor: Vendor, subscriptions: SubscriptionItem[]): boolean {
  if (vendor.kind === "local") return false;
  if (vendor.kind === "subscription") {
    return subscriptionIsUsable(subscriptionStatusForVendor(vendor, subscriptions));
  }
  if (vendor.kind === "api") {
    if (vendor.baseUrl && vendor.apiKey) return true;
    return Boolean(vendor.models?.some((model) => model.baseUrl && model.apiKey));
  }
  return false;
}

export function formatTestBody(result: {
  text?: string;
  detail?: unknown;
  error?: string;
}): string {
  if (result?.text && String(result.text).trim()) return String(result.text);
  if (result?.error && String(result.error).trim()) return String(result.error);
  if (result?.detail) {
    try {
      return JSON.stringify(result.detail, null, 2);
    } catch {
      /* fall through */
    }
  }
  return t("common.noOutput");
}

/** 去掉 Svelte 响应式 Proxy，供 Electron IPC 结构化克隆 */
export function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** @deprecated use getModelTest from store */
export function testStatusClass(key: string, testStatus: Record<string, string>): string {
  const v = testStatus[String(key || "")];
  if (v === "pass") return "test-status--pass";
  if (v === "fail") return "test-status--fail";
  return "";
}

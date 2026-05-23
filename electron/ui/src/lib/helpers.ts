import {
  adapterMessageKey,
  displayVendorName,
  formatSubscriptionSummary,
  t,
} from "./i18n";
import {
  API_STYLES,
  DEFAULT_MODEL_ADAPTERS,
  INTERNAL_PROFILE_PREFIX,
  MODEL_BINDING_PREFIX,
  MODEL_ADAPTER_IDS,
  CUSTOM_API_PROFILE_NAME,
  FIXED_PROVIDER_IDS,
  OLLAMA_DEFAULTS,
  OLLAMA_PROFILE_NAME,
  SUBSCRIPTION_VENDOR_DEFS,
} from "./constants";
import type { FixedProviderId } from "./constants";
import type {
  CliDef,
  ModelAdapterId,
  Preset,
  SubscriptionItem,
  Vendor,
  VendorKind,
  VendorModel,
} from "../global";

export function apiStylesForCli(kind: string): string[] {
  if (kind === "claude-code" || kind === "kimi-code") return ["claude"];
  if (kind === "codex") return ["openai-responses"];
  if (kind === "opencode" || kind === "openclaw" || kind === "hermes") return ["openai-chat"];
  return [];
}

/** CLI ingress segment written into local proxy base URL (/{provider}/{model}/{style}). */
export function defaultCliIngressStyle(kind: string): string {
  return apiStylesForCli(kind)[0] || "openai-chat";
}

export function modelCompatibleWithCli(model: VendorModel, kind: string): boolean {
  // CLI compatibility is determined by its fixed ingress style; upstream styles are converted by the proxy.
  return apiStylesForCli(kind).length > 0 && API_STYLES.includes(model.apiStyle as (typeof API_STYLES)[number]);
}

export function subscriptionProviderIdsForCli(kind: string): string[] {
  if (!apiStylesForCli(kind).length) return [];
  return SUBSCRIPTION_VENDOR_DEFS.map((item) => item.subscriptionProviderId);
}

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
  const vendor = SUBSCRIPTION_VENDOR_DEFS.find((item) => item.subscriptionProviderId === providerId);
  if (!vendor) return `subscription:${providerId}`;
  return modelBindingValue(vendor.name, "default");
}

export function isSubscriptionBinding(value: string, vendors: Vendor[] = []): boolean {
  const parsed = parseModelBinding(value);
  if (!parsed) return false;
  const vendor = findVendorByName(vendors, parsed.vendorName);
  return vendor?.kind === "subscription";
}

export function isModelBinding(value: string): boolean {
  return String(value || "").startsWith(MODEL_BINDING_PREFIX);
}

export function subscriptionProviderFromBinding(value: string, vendors: Vendor[] = []): string {
  const parsed = parseModelBinding(String(value || "").trim());
  if (!parsed) return "";
  const vendor = findVendorByName(vendors, parsed.vendorName);
  if (vendor?.kind === "subscription") {
    return String(vendor.subscriptionProviderId || "").trim();
  }
  return "";
}

export function modelBindingValue(vendorName: string, modelId: string): string {
  return `${MODEL_BINDING_PREFIX}${vendorName}/${modelId}`;
}

export function parseModelBinding(value: string): { vendorName: string; modelId: string } | null {
  if (!isModelBinding(value)) return null;
  const rest = value.slice(MODEL_BINDING_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { vendorName: rest.slice(0, slash), modelId: rest.slice(slash + 1) };
}

export function modelTestStatusKey(binding: string): string {
  return binding;
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
  const count = vendor.models?.length || 0;
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

function cliModelBindingLabel(vendor: Vendor, model: VendorModel): string {
  const provider = displayVendorName(vendor.name) || "Provider";
  const modelName = String(model.label || model.model || model.id || "").trim() || "Model";
  return `${provider}/${modelName}`;
}

export function customApiModelLine(model: VendorModel): string {
  const url = String(model.baseUrl || "").trim() || t("vendorDetail.addressNotConfigured");
  return `${model.model} · ${model.apiStyle} · ${url}`;
}

export function normalizeVendorModel(input: Partial<VendorModel>): VendorModel {
  const model = String(input?.model || "").trim();
  const id = String(input?.id || "").trim() || "default";
  return {
    id,
    label: String(input?.label || "").trim() || model || id,
    model: model || id,
    apiStyle: API_STYLES.includes(input?.apiStyle as (typeof API_STYLES)[number])
      ? (input.apiStyle as string)
      : "openai-chat",
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
    cli: String(input?.cli || ""),
    models,
  };
}

export function normalizePreset(input: Partial<Preset>): Preset {
  const rawStyle = String(input?.apiStyle || "").trim().toLowerCase();
  let apiStyle = "openai-responses";
  if (rawStyle === "anthropic") apiStyle = "claude";
  else if (rawStyle === "openai") apiStyle = "openai-responses";
  else if (API_STYLES.includes(rawStyle as (typeof API_STYLES)[number])) apiStyle = rawStyle;

  const id = String(input?.id || "").trim();
  return {
    id: id || `preset-${Date.now()}`,
    apiName: String(input?.apiName || "").trim(),
    baseUrl: String(input?.baseUrl || "").trim(),
    apiStyle,
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

export type CliBindingOption = {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
};

export function buildCliBindingOptions(
  cli: CliDef,
  vendors: Vendor[],
  subscriptions: SubscriptionItem[],
): CliBindingOption[] {
  const options: CliBindingOption[] = [{ value: "", label: t("common.default") }];

  for (const vendor of managedVendorList(vendors)) {
    for (const model of vendor.models || []) {
      if (!modelCompatibleWithCli(model, cli.kind)) continue;

      if (vendor.kind === "subscription") {
        const providerId = vendor.subscriptionProviderId;
        if (!providerId || !subscriptionProviderIdsForCli(cli.kind).includes(providerId)) {
          continue;
        }
        const sub = subscriptions.find((item) => item.id === providerId);
        const loggedIn = Boolean(sub?.loggedIn);
        const vendorLabel = displayVendorName(vendor.name);
        options.push({
          value: modelBindingValue(vendor.name, model.id),
          label: loggedIn
            ? cliModelBindingLabel(vendor, model)
            : t("binding.loginRequired", { vendor: vendorLabel }),
          disabled: !loggedIn,
          hint: loggedIn ? undefined : t("binding.loginHint", { vendor: vendorLabel }),
        });
        continue;
      }

      options.push({
        value: modelBindingValue(vendor.name, model.id),
        label: cliModelBindingLabel(vendor, model),
      });
    }
  }

  return options;
}

export function canApplyCliBinding(
  binding: string,
  clovapiAvailable: boolean,
  subscriptions: SubscriptionItem[],
  vendors: Vendor[],
): boolean {
  if (!clovapiAvailable) return false;
  if (!String(binding || "").trim()) return true;
  if (isSubscriptionBinding(binding, vendors)) {
    const providerId = subscriptionProviderFromBinding(binding, vendors);
    return Boolean(subscriptions.find((item) => item.id === providerId)?.loggedIn);
  }
  return isModelBinding(binding);
}

export function sortedClisForDisplay(
  clis: readonly CliDef[],
  cliDetectedPath: Record<string, string>,
): CliDef[] {
  const installed: CliDef[] = [];
  const uninstalled: CliDef[] = [];
  for (const cli of clis) {
    if (cliDetectedPath[cli.id]) installed.push(cli);
    else uninstalled.push(cli);
  }
  return [...installed, ...uninstalled];
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

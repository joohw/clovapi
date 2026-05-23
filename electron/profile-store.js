const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { normalizeModelAdapter } = require("./model-adapters");
const providerRegistry = require("./provider-registry");

const STORE_VERSION = 4;
const OLLAMA_PROFILE_NAME = "Ollama";
const CUSTOM_API_PROFILE_NAME = "自定义 API";
const MODEL_BINDING_PREFIX = "@model:";

const { CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS } = require("./claude-backend");
const { CODEX_SUBSCRIPTION_MODEL_FALLBACKS } = require("./codex-backend");

const SUBSCRIPTION_VENDOR_DEFS = [
  {
    subscription_provider_id: "claude-code",
    name: "Claude Code 订阅",
    models: [],
  },
  {
    subscription_provider_id: "codex",
    name: "Codex 订阅",
    models: [],
  },
];

function isPlaceholderSubscriptionModelEntry(entry) {
  const id = String(entry?.id || "").trim().toLowerCase();
  const model = String(entry?.model || "").trim().toLowerCase();
  return !model || id === "default" || model === "default";
}

function configDir() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "clovapi");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, "clovapi");
  return path.join(os.homedir(), ".config", "clovapi");
}

function profilesPath() {
  return path.join(configDir(), "profiles.json");
}

function defaultProxyConfig() {
  return { enabled: true, host: "127.0.0.1", port: 27483 };
}

function emptyStore() {
  return { version: STORE_VERSION, active: {}, profiles: [], proxy: defaultProxyConfig() };
}

function normalizeApiStyle(style) {
  const s = String(style || "").trim().toLowerCase();
  if (s === "openai") return "openai-responses";
  if (s === "anthropic") return "claude";
  const allowed = ["claude", "openai-chat", "openai-responses", "gemini"];
  if (allowed.includes(s)) return s;
  return "openai-responses";
}

function normalizeProfileKind(kind) {
  const k = String(kind || "api").trim().toLowerCase();
  if (k === "subscription" || k === "local") return k;
  return "api";
}

function normalizeModelEntry(raw, index = 0) {
  const model = String(raw?.model || "").trim();
  const id = String(raw?.id || "").trim() || (index === 0 ? "default" : `model-${index + 1}`);
  const label = String(raw?.label || "").trim() || model || id;
  return {
    id,
    label,
    model: model || id,
    api_style: normalizeApiStyle(raw?.api_style ?? raw?.apiStyle),
    base_url: String(raw?.base_url ?? raw?.baseUrl ?? "").trim(),
    api_key: String(raw?.api_key ?? raw?.apiKey ?? "").trim(),
  };
}

function stampModelsWithVendorConnection(models, baseUrl, apiKey) {
  const url = String(baseUrl || "").trim();
  const key = String(apiKey || "").trim();
  return (models || []).map((m) => {
    const entry = normalizeModelEntry(m);
    return {
      ...entry,
      base_url: entry.base_url || url,
      api_key: entry.api_key || key,
    };
  });
}

function normalizeVendorModels(p) {
  if (!Array.isArray(p?.models) || !p.models.length) return [];
  return p.models.map((m, i) => normalizeModelEntry(m, i));
}

function normalizeVendorProfile(p, index = 0) {
  const name = String(p?.name || "").trim() || `vendor-${index + 1}`;
  const kind = normalizeProfileKind(p?.kind);
  const localProvider = String(p?.local_provider || "").trim();
  let models = normalizeVendorModels(p);
  const topModel = String(p?.model || "").trim();
  const apiStyle = normalizeApiStyle(
    p?.api_style ?? p?.apiStyle ?? models[0]?.api_style ?? models[0]?.apiStyle,
  );
  let aggregateModel = topModel || (models[0]?.model || "");
  if ((kind === "subscription" || kind === "local") && !models.length) {
    aggregateModel = "";
  }
  return {
    name,
    kind,
    local_provider: localProvider,
    subscription_provider_id: String(p?.subscription_provider_id || "").trim(),
    model_adapter: normalizeModelAdapter(p?.model_adapter, kind, localProvider),
    cli: p?.cli ? String(p.cli) : "",
    api_style: apiStyle,
    base_url: String(p?.base_url || "").trim(),
    api_key: String(p?.api_key || ""),
    model: aggregateModel,
    models,
  };
}

function enforceAllowedProfiles(store) {
  const before = store.profiles.length;
  store.profiles = store.profiles.filter((profile) => providerRegistry.isAllowedStoreProfile(profile));
  return store.profiles.length < before;
}

function isLocalProxyStubActiveValue(value) {
  const v = String(value || "").trim();
  return v.toLowerCase().startsWith("__local_proxy_");
}

/** 清理 active：去掉 clovapi switch 写入的 stub 名、无效 @model 绑定、已删除供应商。 */
function sanitizeActiveBindings(store) {
  if (!store || typeof store !== "object") return false;
  if (!store.active || typeof store.active !== "object") {
    store.active = {};
    return false;
  }
  let changed = false;
  for (const [cli, activeName] of Object.entries({ ...store.active })) {
    const value = String(activeName || "").trim();
    if (!value) {
      delete store.active[cli];
      changed = true;
      continue;
    }
    if (isLocalProxyStubActiveValue(value) || !value.startsWith(MODEL_BINDING_PREFIX)) {
      delete store.active[cli];
      changed = true;
      continue;
    }
    const parsed = parseModelBinding(value);
    if (!parsed || !findVendorModel(store, parsed.vendorName, parsed.modelId)) {
      delete store.active[cli];
      changed = true;
    }
  }
  return changed;
}

function finalizeStore(store) {
  ensureDefaultOllamaProfile(store);
  enforceAllowedProfiles(store);
  sanitizeActiveBindings(store);
}

function parseModelBinding(binding) {
  const value = String(binding || "").trim();
  if (!value.startsWith(MODEL_BINDING_PREFIX)) return null;
  const rest = value.slice(MODEL_BINDING_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return {
    vendorName: rest.slice(0, slash),
    modelId: rest.slice(slash + 1),
  };
}

function vendorKindRank(kind) {
  const k = String(kind || "api").trim().toLowerCase();
  if (k === "subscription") return 0;
  if (k === "local") return 1;
  return 2;
}

/** 按名称解析供应商：内置订阅/Ollama 优先正确 kind，避免同名 api 脏数据被先命中。 */
function findStoreVendorProfile(store, vendorName) {
  const key = String(vendorName || "").trim().toLowerCase();
  if (!key) return null;
  const profiles = Array.isArray(store?.profiles) ? store.profiles : [];

  if (isBuiltinSubscriptionVendorName(vendorName)) {
    for (const def of SUBSCRIPTION_VENDOR_DEFS) {
      if (def.name.toLowerCase() !== key) continue;
      const hit = profiles.find(
        (p) =>
          p.kind === "subscription" &&
          String(p.subscription_provider_id || "") === def.subscription_provider_id,
      );
      return hit || defaultSubscriptionStoreProfile(def);
    }
  }

  if (isDefaultOllamaProfileName(vendorName)) {
    const hit = profiles.find(
      (p) => String(p.name || "").toLowerCase() === key && p.kind === "local",
    );
    return hit || defaultOllamaStoreProfile();
  }

  if (isDefaultCustomApiProfileName(vendorName)) {
    const hit = profiles.find(
      (p) => String(p.name || "").toLowerCase() === key && p.kind === "api",
    );
    return hit || defaultCustomApiStoreProfile();
  }

  const matches = profiles.filter((p) => String(p.name || "").toLowerCase() === key);
  if (!matches.length) return null;
  matches.sort((a, b) => vendorKindRank(a.kind) - vendorKindRank(b.kind));
  return matches[0];
}

function subscriptionDefaultApiStyle(vendor) {
  const providerId = String(vendor?.subscription_provider_id || "").trim();
  const def = SUBSCRIPTION_VENDOR_DEFS.find((item) => item.subscription_provider_id === providerId);
  if (def?.models?.[0]?.api_style) return def.models[0].api_style;
  if (providerId === "codex") return "openai-responses";
  return "claude";
}

function findVendorModel(store, vendorName, modelId) {
  const vendor = findStoreVendorProfile(store, vendorName);
  if (!vendor) return null;
  const id = String(modelId || "").trim().toLowerCase();
  if (!id) return null;
  const model = (vendor.models || []).find((m) => {
    const mid = String(m.id || "").toLowerCase();
    const upstream = String(m.model || "").toLowerCase();
    return mid === id || upstream === id;
  });
  if (model) return { vendor, model };

  // 订阅：应用时可能从 OAuth 解析出路径上的 modelId，但尚未写入 models[]（运行时代理仍需解析）
  if (String(vendor.kind || "").trim().toLowerCase() === "subscription") {
    const wire = String(modelId || "").trim();
    if (wire && wire.toLowerCase() !== "default") {
      return {
        vendor,
        model: normalizeModelEntry(
          {
            id: wire,
            label: wire,
            model: wire,
            api_style: subscriptionDefaultApiStyle(vendor),
          },
          0,
        ),
      };
    }
  }
  return null;
}

function mergeVendorModels(existing, fetched) {
  const map = new Map();
  for (const raw of existing || []) {
    const entry = normalizeModelEntry(raw);
    map.set(entry.id.toLowerCase(), entry);
  }
  for (const raw of fetched || []) {
    const incoming = normalizeModelEntry(raw);
    const key = incoming.id.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        ...prev,
        model: incoming.model,
        label: prev.label || incoming.label,
        api_style: prev.api_style || incoming.api_style,
        base_url: incoming.base_url || prev.base_url,
        api_key: incoming.api_key || prev.api_key,
      });
    } else {
      map.set(key, incoming);
    }
  }
  return Array.from(map.values());
}

function storeFromUiVendors(vendors, active = {}, proxy = null) {
  const store = emptyStore();
  store.active = active && typeof active === "object" ? { ...active } : {};
  if (proxy && typeof proxy === "object") {
    store.proxy = {
      enabled: proxy.enabled !== false,
      host: String(proxy.host || "127.0.0.1").trim() || "127.0.0.1",
      port: Number(proxy.port) || 27483,
    };
  }
  store.profiles = (Array.isArray(vendors) ? vendors : []).map((vendor) =>
    normalizeVendorProfile(toStoreProfile(vendor)),
  );
  finalizeStore(store);
  return store;
}

function resolveModelBinding(store, binding) {
  const parsed = parseModelBinding(binding);
  if (!parsed) return null;
  const hit = findVendorModel(store, parsed.vendorName, parsed.modelId);
  if (!hit) return null;
  const { vendor, model } = hit;
  const useModelConnection = isDefaultCustomApiProfileName(vendor.name);
  const flat = {
    name: String(vendor.name || "").startsWith("__") ? vendor.name : `${vendor.name}/${model.id}`,
    kind: vendor.kind,
    local_provider: vendor.local_provider,
    subscription_provider_id: vendor.subscription_provider_id,
    cli: vendor.cli,
    base_url: useModelConnection
      ? String(model.base_url || "").trim()
      : vendor.base_url,
    api_key: useModelConnection ? String(model.api_key || "").trim() : vendor.api_key,
    api_style: model.api_style,
    model: model.model,
  };
  return flat;
}

function normalizeStore(raw) {
  const store = {
    version: Number(raw?.version) || STORE_VERSION,
    active: raw?.active && typeof raw.active === "object" ? { ...raw.active } : {},
    profiles: [],
    proxy: defaultProxyConfig(),
  };
  if (raw?.proxy && typeof raw.proxy === "object") {
    store.proxy = {
      enabled: true,
      host: String(raw.proxy.host || "127.0.0.1").trim() || "127.0.0.1",
      port: Number(raw.proxy.port) || 27483,
    };
  }
  const list = Array.isArray(raw?.profiles) ? raw.profiles : [];
  store.profiles = list.map((p, i) => normalizeVendorProfile(p, i));
  finalizeStore(store);
  return store;
}

function toVendorModel(m) {
  return {
    id: m.id,
    label: m.label,
    model: m.model,
    apiStyle: m.api_style,
    baseUrl: m.base_url || "",
    apiKey: m.api_key || "",
  };
}

function toVendor(p) {
  return {
    name: p.name,
    kind: p.kind || "api",
    localProvider: p.local_provider || "",
    subscriptionProviderId: p.subscription_provider_id || "",
    modelAdapter: p.model_adapter || "openai-compatible",
    baseUrl: p.base_url,
    apiKey: p.api_key,
    cli: p.cli || "",
    models: (p.models || []).map(toVendorModel),
  };
}

function toStoreModel(model) {
  return normalizeModelEntry({
    id: model.id,
    label: model.label,
    model: model.model,
    api_style: model.apiStyle,
    base_url: model.baseUrl,
    api_key: model.apiKey,
  });
}

function toStoreProfile(vendor) {
  const kind = normalizeProfileKind(vendor.kind);
  const localProvider = String(vendor.localProvider || "").trim();
  return {
    name: String(vendor.name || "").trim(),
    kind,
    local_provider: localProvider,
    subscription_provider_id: String(vendor.subscriptionProviderId || "").trim(),
    model_adapter: normalizeModelAdapter(vendor.modelAdapter, kind, localProvider),
    cli: vendor.cli ? String(vendor.cli) : "",
    base_url: String(vendor.baseUrl || "").trim(),
    api_key: String(vendor.apiKey || ""),
    models: Array.isArray(vendor.models) ? vendor.models.map(toStoreModel) : [],
  };
}

async function loadStore() {
  const p = profilesPath();
  try {
    const data = await fs.promises.readFile(p, "utf8");
    return normalizeStore(JSON.parse(data));
  } catch (err) {
    if (err && err.code === "ENOENT") return emptyStore();
    throw err;
  }
}

async function saveStore(store) {
  const normalized = normalizeStore(store);
  const p = profilesPath();
  const dir = path.dirname(p);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const data = `${JSON.stringify(normalized, null, 2)}\n`;
  const tmp = `${p}.tmp`;
  await fs.promises.writeFile(tmp, data, { mode: 0o600 });
  try {
    await fs.promises.rename(tmp, p);
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
  return normalized;
}

function upsertProfile(store, profile) {
  if (!providerRegistry.isAllowedStoreProfile(profile)) {
    throw new Error(`不允许注册供应商: ${profile?.name || "(unnamed)"}`);
  }
  const name = profile.name;
  const idx = store.profiles.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) store.profiles[idx] = profile;
  else store.profiles.push(profile);
}

function removeProfile(store, name) {
  const key = String(name || "").trim();
  if (
    isDefaultOllamaProfileName(key) ||
    isBuiltinSubscriptionVendorName(key) ||
    isDefaultCustomApiProfileName(key)
  ) {
    return false;
  }
  const before = store.profiles.length;
  store.profiles = store.profiles.filter((p) => p.name.toLowerCase() !== key.toLowerCase());
  for (const [cli, activeName] of Object.entries(store.active)) {
    const parsed = parseModelBinding(activeName);
    if (parsed && parsed.vendorName.toLowerCase() === key.toLowerCase()) {
      delete store.active[cli];
    }
  }
  return store.profiles.length < before;
}

function removeVendorModel(store, vendorName, modelId) {
  const vendor = store.profiles.find(
    (p) => String(p.name || "").toLowerCase() === String(vendorName || "").trim().toLowerCase(),
  );
  if (!vendor) return false;
  if (vendor.kind === "subscription" && (vendor.models || []).length <= 1) {
    return false;
  }
  const before = (vendor.models || []).length;
  vendor.models = (vendor.models || []).filter(
    (m) => String(m.id || "").toLowerCase() !== String(modelId || "").trim().toLowerCase(),
  );
  for (const [cli, activeName] of Object.entries(store.active)) {
    if (String(activeName) === `${MODEL_BINDING_PREFIX}${vendor.name}/${modelId}`) {
      delete store.active[cli];
    }
  }
  return vendor.models.length < before;
}

function renameActiveBindings(store, oldName, newName) {
  const oldKey = String(oldName || "").trim().toLowerCase();
  const next = String(newName || "").trim();
  if (!oldKey || !next) return;
  for (const [cli, activeName] of Object.entries(store.active)) {
    const parsed = parseModelBinding(activeName);
    if (parsed && parsed.vendorName.toLowerCase() === oldKey) {
      store.active[cli] = `${MODEL_BINDING_PREFIX}${next}/${parsed.modelId}`;
    }
  }
}

function defaultSubscriptionStoreProfile(def) {
  return normalizeVendorProfile({
    name: def.name,
    kind: "subscription",
    subscription_provider_id: def.subscription_provider_id,
    model_adapter: "subscription",
    base_url: "",
    api_key: "",
    models: [],
  });
}

function isBuiltinSubscriptionVendorName(name) {
  const key = String(name || "").trim().toLowerCase();
  return SUBSCRIPTION_VENDOR_DEFS.some((def) => def.name.toLowerCase() === key);
}

function isBuiltinSubscriptionVendor(vendor) {
  if (!vendor || vendor.kind !== "subscription") return false;
  const providerId = String(vendor.subscription_provider_id || "").trim();
  return SUBSCRIPTION_VENDOR_DEFS.some((def) => def.subscription_provider_id === providerId);
}

function pruneStaleBuiltinVendors(store) {
  const before = store.profiles.length;
  store.profiles = store.profiles.filter((p) => {
    const name = String(p.name || "").trim();
    if (isBuiltinSubscriptionVendorName(name) && p.kind !== "subscription") {
      return false;
    }
    if (
      isDefaultOllamaProfileName(name) &&
      String(p.kind || "").trim().toLowerCase() !== "local"
    ) {
      return false;
    }
    if (isDefaultCustomApiProfileName(name) && String(p.kind || "").trim().toLowerCase() !== "api") {
      return false;
    }
    return true;
  });
  return store.profiles.length < before;
}

function ensureDefaultSubscriptionVendors(store) {
  let changed = pruneStaleBuiltinVendors(store);
  for (const def of SUBSCRIPTION_VENDOR_DEFS) {
    const idx = store.profiles.findIndex(
      (p) =>
        p.kind === "subscription" &&
        String(p.subscription_provider_id || "") === def.subscription_provider_id,
    );
    if (idx < 0) {
      store.profiles.push(defaultSubscriptionStoreProfile(def));
      changed = true;
      continue;
    }
    const profile = store.profiles[idx];
    if (profile.name !== def.name) {
      renameActiveBindings(store, profile.name, def.name);
      profile.name = def.name;
      changed = true;
    }
    if (profile.kind !== "subscription") {
      profile.kind = "subscription";
      changed = true;
    }
    if (String(profile.subscription_provider_id || "") !== def.subscription_provider_id) {
      profile.subscription_provider_id = def.subscription_provider_id;
      changed = true;
    }
    if (String(profile.model_adapter || "") !== "subscription") {
      profile.model_adapter = "subscription";
      changed = true;
    }
    if (!Array.isArray(profile.models)) {
      profile.models = [];
      changed = true;
    } else if (
      profile.models.length === 1 &&
      isPlaceholderSubscriptionModelEntry(profile.models[0])
    ) {
      // 清掉历史版本写入的占位 default，允许用户通过「拉取模型」自行填充。
      profile.models = [];
      changed = true;
    }
  }
  return changed;
}

function isOllamaBuiltinPlaceholderModel(entry) {
  const id = String(entry?.id || "").trim().toLowerCase();
  const model = String(entry?.model || "").trim();
  const label = String(entry?.label || "").trim();
  if (id === "default") return true;
  return id === "llama3.2" && model === "llama3.2" && label === "Llama 3.2";
}

function pruneOllamaBuiltinPlaceholderModels(store) {
  const profile = store.profiles.find(
    (p) => String(p.name || "").toLowerCase() === OLLAMA_PROFILE_NAME.toLowerCase(),
  );
  if (!profile || !Array.isArray(profile.models)) return false;
  const before = profile.models.length;
  const kept = [];
  for (const raw of profile.models) {
    const entry = normalizeModelEntry(raw);
    if (isOllamaBuiltinPlaceholderModel(entry)) {
      const binding = `${MODEL_BINDING_PREFIX}${OLLAMA_PROFILE_NAME}/${entry.id}`;
      for (const [cli, activeName] of Object.entries(store.active || {})) {
        if (String(activeName) === binding) delete store.active[cli];
      }
      continue;
    }
    kept.push(entry);
  }
  if (kept.length === before) return false;
  profile.models = kept;
  if (!kept.length) profile.model = "";
  return true;
}

function defaultOllamaStoreProfile() {
  return normalizeVendorProfile({
    name: OLLAMA_PROFILE_NAME,
    kind: "local",
    local_provider: "ollama",
    model_adapter: "ollama",
    base_url: "http://127.0.0.1:11434/v1",
    api_key: "ollama",
    models: [],
  });
}

function defaultCustomApiStoreProfile() {
  return normalizeVendorProfile({
    name: CUSTOM_API_PROFILE_NAME,
    kind: "api",
    model_adapter: "manual",
    base_url: "",
    api_key: "",
    models: [],
  });
}

function isExtraApiProfile(profile) {
  if (!profile || profile.kind !== "api") return false;
  const name = String(profile.name || "").trim();
  if (!name || name.startsWith("__")) return false;
  if (!providerRegistry.isAllowedUserVendorProfile(profile)) return true;
  return !isDefaultCustomApiProfileName(name);
}

function ensureDefaultCustomApiVendor(store) {
  let changed = false;
  const customKey = CUSTOM_API_PROFILE_NAME.toLowerCase();
  let customIdx = store.profiles.findIndex(
    (p) => String(p.name || "").toLowerCase() === customKey && p.kind === "api",
  );

  const extras = store.profiles.filter((p) => isExtraApiProfile(p));
  if (customIdx < 0) {
    const merged = defaultCustomApiStoreProfile();
    for (const extra of extras) {
      const stamped = stampModelsWithVendorConnection(
        extra.models,
        extra.base_url,
        extra.api_key,
      );
      merged.models = mergeVendorModels(merged.models, stamped);
    }
    store.profiles.push(merged);
    customIdx = store.profiles.length - 1;
    changed = true;
  } else {
    const custom = store.profiles[customIdx];
    for (const extra of extras) {
      const stamped = stampModelsWithVendorConnection(
        extra.models,
        extra.base_url,
        extra.api_key,
      );
      custom.models = mergeVendorModels(custom.models, stamped);
      changed = true;
    }
  }

  if (extras.length) {
    store.profiles = store.profiles.filter((p) => !isExtraApiProfile(p));
    changed = true;
    customIdx = store.profiles.findIndex(
      (p) => String(p.name || "").toLowerCase() === customKey && p.kind === "api",
    );
  }

  const profile = store.profiles[customIdx];
  if (profile.name !== CUSTOM_API_PROFILE_NAME) {
    renameActiveBindings(store, profile.name, CUSTOM_API_PROFILE_NAME);
    profile.name = CUSTOM_API_PROFILE_NAME;
    changed = true;
  }
  if (profile.kind !== "api") {
    profile.kind = "api";
    changed = true;
  }
  if (String(profile.model_adapter || "") !== "manual") {
    profile.model_adapter = "manual";
    changed = true;
  }
  if (profile.base_url || profile.api_key) {
    profile.models = stampModelsWithVendorConnection(
      profile.models,
      profile.base_url,
      profile.api_key,
    );
    profile.base_url = "";
    profile.api_key = "";
    changed = true;
  }
  return changed;
}

function ensureDefaultOllamaProfile(store) {
  let changed = ensureDefaultSubscriptionVendors(store);
  const idx = store.profiles.findIndex(
    (p) => String(p.name || "").toLowerCase() === OLLAMA_PROFILE_NAME.toLowerCase(),
  );
  if (idx < 0) {
    store.profiles.push(defaultOllamaStoreProfile());
    changed = true;
  } else {
    const profile = store.profiles[idx];
    const defaults = defaultOllamaStoreProfile();
    if (profile.kind !== "local") {
      profile.kind = "local";
      changed = true;
    }
    if (String(profile.local_provider || "").toLowerCase() !== "ollama") {
      profile.local_provider = "ollama";
      changed = true;
    }
    if (!profile.base_url) {
      profile.base_url = defaults.base_url;
      changed = true;
    }
    if (!profile.api_key) {
      profile.api_key = defaults.api_key;
      changed = true;
    }
    if (String(profile.model_adapter || "") !== "ollama") {
      profile.model_adapter = "ollama";
      changed = true;
    }
    if (pruneOllamaBuiltinPlaceholderModels(store)) changed = true;
  }
  if (ensureDefaultCustomApiVendor(store)) changed = true;
  return changed;
}

function isDefaultOllamaProfileName(name) {
  return String(name || "").trim().toLowerCase() === OLLAMA_PROFILE_NAME.toLowerCase();
}

function isDefaultCustomApiProfileName(name) {
  return String(name || "").trim().toLowerCase() === CUSTOM_API_PROFILE_NAME.toLowerCase();
}

module.exports = {
  configDir,
  profilesPath,
  emptyStore,
  defaultProxyConfig,
  loadStore,
  saveStore,
  upsertProfile,
  removeProfile,
  removeVendorModel,
  renameActiveBindings,
  toVendor,
  toStoreProfile,
  normalizeApiStyle,
  ensureDefaultOllamaProfile,
  ensureDefaultSubscriptionVendors,
  pruneStaleBuiltinVendors,
  isDefaultOllamaProfileName,
  isDefaultCustomApiProfileName,
  ensureDefaultCustomApiVendor,
  enforceAllowedProfiles,
  CUSTOM_API_PROFILE_NAME,
  isBuiltinSubscriptionVendor,
  isBuiltinSubscriptionVendorName,
  OLLAMA_PROFILE_NAME,
  MODEL_BINDING_PREFIX,
  SUBSCRIPTION_VENDOR_DEFS,
  providerRegistry,
  parseModelBinding,
  findStoreVendorProfile,
  findVendorModel,
  mergeVendorModels,
  storeFromUiVendors,
  resolveModelBinding,
  sanitizeActiveBindings,
  isLocalProxyStubActiveValue,
};

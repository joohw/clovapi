const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");
const { runHttpProbe } = require("./model-test-paths");
const { resolveSubscriptionTestModel } = require("./subscription-auth");
const {
  fetchCodexBackendModels,
  resolveCodexSubscriptionTestModel,
} = require("./codex-backend");
const {
  fetchClaudeOAuthModels,
  resolveClaudeSubscriptionTestModel,
} = require("./claude-backend");

const SUBSCRIPTION_VENDOR_DEFS = [
  { subscription_provider_id: "claude-code", name: "Claude Subscription" },
  { subscription_provider_id: "codex", name: "Codex Subscription" },
];
const CUSTOM_API_PROFILE_NAME = "Custom API";

const ADAPTER_IDS = ["manual", "openai-compatible", "ollama", "subscription"];

const ADAPTER_CATALOG = [
  {
    id: "manual",
    label: "手动维护",
    description: "不自动拉取；测试走原生 HTTP（chat / responses / claude 等）",
  },
  {
    id: "openai-compatible",
    label: "OpenAI 兼容",
    description: "拉取 GET /v1/models；测试走原生 HTTP 按 api_style 分流",
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "拉取 GET /api/tags；测试走 OpenAI Chat HTTP 路径",
  },
  {
    id: "subscription",
    label: "官方订阅",
    description: "拉取官方 OAuth 模型表（Codex backend-api / Claude /v1/models）",
  },
];

const DEFAULT_API_STYLE = {
  manual: "openai-chat",
  "openai-compatible": "openai-chat",
  ollama: "openai-chat",
  subscription: "openai-responses",
};

const FETCH_TIMEOUT_MS = 20_000;

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function normalizeModelAdapter(raw, vendorKind, localProvider) {
  const kind = String(vendorKind || "").trim().toLowerCase();
  if (kind === "subscription") return "subscription";
  const id = String(raw || "").trim();
  if (ADAPTER_IDS.includes(id)) return id;
  if (kind === "local") {
    if (String(localProvider || "").trim().toLowerCase() === "ollama") return "ollama";
  }
  return "openai-compatible";
}

function slugModelId(label, model) {
  const base = String(label || model || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `model-${Date.now()}`;
}

function vendorToAdapterInput(vendor) {
  return {
    name: String(vendor?.name || "").trim(),
    kind: String(vendor?.kind || "api").trim().toLowerCase(),
    local_provider: String(vendor?.local_provider ?? vendor?.localProvider ?? "").trim(),
    subscription_provider_id: String(
      vendor?.subscription_provider_id ?? vendor?.subscriptionProviderId ?? "",
    ).trim(),
    base_url: String(vendor?.base_url ?? vendor?.baseUrl ?? "").trim(),
    api_key: String(vendor?.api_key ?? vendor?.apiKey ?? "").trim(),
    model_adapter: normalizeModelAdapter(
      vendor?.model_adapter ?? vendor?.modelAdapter,
      vendor?.kind,
      vendor?.local_provider ?? vendor?.localProvider,
    ),
  };
}

function httpGetJson(urlString, headers = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      reject(error);
      return;
    }

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${bodyText.slice(0, 400)}`));
            return;
          }
          try {
            resolve(JSON.parse(bodyText));
          } catch {
            reject(new Error(`响应不是 JSON: ${bodyText.slice(0, 200)}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 (${timeoutMs}ms)`));
    });
    req.on("error", reject);
    req.end();
  });
}

function authHeaders(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

function modelsUrlCandidates(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return [];
  const urls = [];
  if (base.endsWith("/v1")) {
    urls.push(`${base}/models`);
  } else {
    urls.push(`${base}/v1/models`);
    urls.push(`${base}/models`);
  }
  return [...new Set(urls)];
}

function normalizeModelEntry(raw, defaultApiStyle) {
  const model = String(raw?.model || "").trim();
  if (!model) return null;
  const label = String(raw?.label || "").trim() || model;
  const id = String(raw?.id || "").trim() || slugModelId(label, model);
  const apiStyle = String(raw?.api_style ?? raw?.apiStyle ?? defaultApiStyle).trim() || defaultApiStyle;
  return {
    id,
    label,
    model,
    api_style: apiStyle,
    base_url: String(raw?.base_url ?? raw?.baseUrl ?? "").trim(),
    api_key: String(raw?.api_key ?? raw?.apiKey ?? "").trim(),
  };
}

function parseOpenAiModels(body, defaultApiStyle) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : null;
  if (!list) {
    throw new Error("无法解析模型列表（期望 data[] 或 models[]）");
  }
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const modelId = String(item?.id || item?.name || "").trim();
    if (!modelId || seen.has(modelId.toLowerCase())) continue;
    seen.add(modelId.toLowerCase());
    const entry = normalizeModelEntry(
      { id: slugModelId(modelId, modelId), label: modelId, model: modelId, api_style: defaultApiStyle },
      defaultApiStyle,
    );
    if (entry) out.push(entry);
  }
  return out;
}

async function fetchOpenAiCompatibleModels(vendor, defaultApiStyle) {
  const baseUrl = normalizeBaseUrl(vendor.base_url);
  if (!baseUrl) throw new Error("base_url 为空");
  const headers = authHeaders(vendor.api_key);
  let lastError = null;
  for (const url of modelsUrlCandidates(baseUrl)) {
    try {
      const body = await httpGetJson(url, headers);
      const models = parseOpenAiModels(body, defaultApiStyle);
      if (!models.length) throw new Error("上游返回空模型列表");
      return { models, source: url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("无法拉取模型列表");
}

async function fetchOllamaModels(vendor, defaultApiStyle) {
  const baseUrl = normalizeBaseUrl(vendor.base_url);
  if (!baseUrl) throw new Error("base_url 为空");

  const nativeBase = baseUrl.replace(/\/v1\/?$/i, "");
  const headers = authHeaders(vendor.api_key);

  try {
    const body = await httpGetJson(`${nativeBase}/api/tags`, headers);
    const tags = Array.isArray(body?.models) ? body.models : [];
    const models = [];
    const seen = new Set();
    for (const item of tags) {
      const modelId = String(item?.name || item?.model || "").trim();
      if (!modelId || seen.has(modelId.toLowerCase())) continue;
      seen.add(modelId.toLowerCase());
      const entry = normalizeModelEntry(
        { id: slugModelId(modelId, modelId), label: modelId, model: modelId, api_style: defaultApiStyle },
        defaultApiStyle,
      );
      if (entry) models.push(entry);
    }
    if (models.length) {
      return { models, source: `${nativeBase}/api/tags` };
    }
  } catch {
    /* fall through to OpenAI-compatible endpoint */
  }

  return fetchOpenAiCompatibleModels(vendor, defaultApiStyle);
}

function resolveSubscriptionProviderId(vendor) {
  let providerId = String(vendor.subscription_provider_id || "").trim();
  if (providerId) return providerId;
  const key = String(vendor.name || "").trim().toLowerCase();
  if (!key) return "";
  const def = SUBSCRIPTION_VENDOR_DEFS.find((item) => item.name.toLowerCase() === key);
  return def ? String(def.subscription_provider_id || "").trim() : "";
}

function catalogToVendorModels(catalog, defaultApiStyle) {
  const models = [];
  const seen = new Set();
  for (const item of catalog || []) {
    const modelId = String(item?.model || item?.id || "").trim();
    if (!modelId || seen.has(modelId.toLowerCase())) continue;
    seen.add(modelId.toLowerCase());
    const entry = normalizeModelEntry(
      {
        id: slugModelId(modelId, modelId),
        label: String(item?.label || modelId).trim() || modelId,
        model: modelId,
        api_style: defaultApiStyle,
      },
      defaultApiStyle,
    );
    if (entry) models.push(entry);
  }
  return models;
}

async function fetchSubscriptionModels(vendor) {
  const providerId = resolveSubscriptionProviderId(vendor);
  if (!providerId) {
    throw new Error(
      `未知订阅供应商: ${vendor.name || "(空)"}（缺少 subscription_provider_id）`,
    );
  }

  if (providerId === "codex") {
    const { fallbackCodexModels } = require("./codex-backend");
    let result;
    try {
      result = await fetchCodexBackendModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/未登录|缺少 access_token|缺少 chatgpt account_id/i.test(message)) {
        throw error;
      }
      result = { models: fallbackCodexModels(), source: "fallback" };
    }
    let models = catalogToVendorModels(result.models, "openai-responses");
    if (!models.length) {
      models = catalogToVendorModels(fallbackCodexModels(), "openai-responses");
    }
    if (!models.length) {
      throw new Error("未拉取到任何 Codex 模型");
    }
    return {
      models,
      source: result.source,
      replaceModels: true,
      message: result.source === "fallback" ? "使用内置 Codex 模型列表" : "",
    };
  }

  if (providerId === "claude-code") {
    const { fallbackClaudeModels } = require("./claude-backend");
    let result;
    try {
      result = await fetchClaudeOAuthModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/未登录|缺少 access_token/i.test(message)) {
        throw error;
      }
      result = { models: fallbackClaudeModels(), source: "fallback" };
    }
    let models = catalogToVendorModels(result.models, "claude");
    if (!models.length) {
      models = catalogToVendorModels(fallbackClaudeModels(), "claude");
    }
    if (!models.length) {
      throw new Error("未拉取到任何 Claude 模型");
    }
    return {
      models,
      source: result.source,
      replaceModels: true,
      message: result.source === "fallback" ? "使用内置 Claude 模型列表" : "",
    };
  }

  throw new Error(`未知订阅供应商: ${providerId}`);
}

async function listVendorModels(vendorInput) {
  const vendor = vendorToAdapterInput(vendorInput);
  const adapterId = vendor.model_adapter;
  const defaultApiStyle = DEFAULT_API_STYLE[adapterId] || "openai-chat";

  if (adapterId === "manual") {
    return {
      ok: true,
      adapterId,
      models: [],
      source: "",
      message: "当前适配器为手动维护，不会自动拉取",
    };
  }

  let result;
  if (adapterId === "ollama") {
    result = await fetchOllamaModels(vendor, defaultApiStyle);
  } else if (adapterId === "openai-compatible") {
    result = await fetchOpenAiCompatibleModels(vendor, defaultApiStyle);
  } else if (adapterId === "subscription") {
    result = await fetchSubscriptionModels(vendor);
  } else {
    throw new Error(`未知适配器: ${adapterId}`);
  }

  return {
    ok: true,
    adapterId,
    models: result.models,
    source: result.source,
    replaceModels: Boolean(result.replaceModels),
  };
}

function modelToAdapterInput(modelInput, defaultApiStyle = "openai-chat") {
  return normalizeModelEntry(modelInput, defaultApiStyle);
}

function buildConnectionTestProfile(vendor, model) {
  const name = String(vendor.name || "").trim();
  const normalized = normalizeModelEntry(model);
  const modelId = String(normalized.id || "").trim();
  const useModelConnection =
    String(vendor.kind || "").trim() === "api" && name === CUSTOM_API_PROFILE_NAME;
  return {
    name: name.startsWith("__") ? name : `${name}/${modelId || normalized.model}`,
    kind: vendor.kind,
    base_url: useModelConnection ? normalized.base_url : vendor.base_url,
    api_key: useModelConnection ? normalized.api_key : vendor.api_key,
    api_style: normalized.api_style,
    model: normalized.model,
  };
}

async function testManualModel(vendor, model) {
  const profile = buildConnectionTestProfile(vendor, model);
  return runHttpProbe(profile, { adapterId: "manual" });
}

async function testOpenAiCompatibleModel(vendor, model) {
  const profile = buildConnectionTestProfile(vendor, model);
  return runHttpProbe(profile, { adapterId: "openai-compatible" });
}

async function testOllamaModel(vendor, model) {
  const profile = buildConnectionTestProfile(vendor, model);
  return runHttpProbe(profile, { adapterId: "ollama" });
}

async function testSubscriptionModel(vendor, model, options = {}) {
  const providerId = String(vendor.subscription_provider_id || "").trim();
  const build = options.buildSubscriptionProfile;
  if (typeof build !== "function") {
    throw new Error("subscription 适配器测试需要 buildSubscriptionProfile");
  }
  const built = build(providerId);
  if (!built?.ok || !built.profile) {
    return {
      ok: false,
      summary: "测试失败",
      text: built?.error || "无法从订阅凭据生成测试 profile",
      detail: { adapterId: "subscription", providerId, error: built?.error },
    };
  }
  const profile = {
    ...built.profile,
    model:
      providerId === "codex"
        ? await resolveCodexSubscriptionTestModel(model)
        : providerId === "claude-code"
          ? await resolveClaudeSubscriptionTestModel(model)
          : resolveSubscriptionTestModel(providerId, model, built.profile),
    api_style: String(model.api_style || built.profile.api_style || "").trim(),
  };
  return runHttpProbe(profile, { adapterId: "subscription", providerId });
}

async function testVendorModel(vendorInput, modelInput, options = {}) {
  const vendor = vendorToAdapterInput(vendorInput);
  const adapterId = vendor.model_adapter;
  const defaultApiStyle = DEFAULT_API_STYLE[adapterId] || "openai-chat";
  const model = modelToAdapterInput(modelInput, defaultApiStyle);
  if (!model) {
    throw new Error("模型配置无效");
  }

  if (adapterId === "manual") {
    return testManualModel(vendor, model);
  }
  if (adapterId === "openai-compatible") {
    return testOpenAiCompatibleModel(vendor, model);
  }
  if (adapterId === "ollama") {
    return testOllamaModel(vendor, model);
  }
  if (adapterId === "subscription") {
    return testSubscriptionModel(vendor, model, options);
  }
  throw new Error(`未知适配器: ${adapterId}`);
}

async function testVendorModelViaProxy(vendorInput, modelInput, options = {}) {
  const { buildProxyTestProfile } = require("./proxy-ingress-cli");
  const vendor = vendorToAdapterInput(vendorInput);
  const adapterId = vendor.model_adapter;
  const port = Number(options.port) || 27483;
  const profile = await buildProxyTestProfile(vendorInput, modelInput, port);
  return runHttpProbe(profile, { adapterId, viaProxy: true });
}

module.exports = {
  ADAPTER_IDS,
  ADAPTER_CATALOG,
  DEFAULT_API_STYLE,
  normalizeModelAdapter,
  vendorToAdapterInput,
  listVendorModels,
  testVendorModel,
  testVendorModelViaProxy,
  testManualModel,
  testOpenAiCompatibleModel,
  testOllamaModel,
  testSubscriptionModel,
};

const subscriptionAuth = require("./subscription-auth");
const profileStore = require("./profile-store");
const providerRegistry = require("./provider-registry");
const { buildClaudeOAuthHeaders, isClaudeOAuthToken } = require("./claude-backend");

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function joinUrl(base, pathSuffix) {
  const b = normalizeBaseUrl(base);
  const p = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
  if (b.endsWith("/v1")) {
    if (p.startsWith("/v1/")) return `${b}${p.slice(3)}`;
    return `${b}${p}`;
  }
  // Codex ChatGPT backend uses /codex/responses without a /v1 prefix.
  if (p.startsWith("/codex/")) return `${b}${p}`;
  // Ingress path strips the /v1 prefix; suffix is e.g. /messages or /chat/completions.
  if (p === "/" || p === "") return `${b}/v1`;
  if (p.startsWith("/v1/") || p === "/v1") return `${b}${p}`;
  return `${b}/v1${p}`;
}

function isModelBinding(binding) {
  return String(binding || "").startsWith(profileStore.MODEL_BINDING_PREFIX);
}

function subscriptionTargetCliForProvider(providerId) {
  const id = String(providerId || "").trim();
  if (id === "claude-code" || id === "codex") return id;
  return "opencode";
}

function resolveBindingUpstream(binding, targetCli, store) {
  const key = String(binding || "").trim();
  if (!key) {
    throw new Error("未指定模型（路径中需包含有效的 providerId 与 modelId）");
  }

  if (!isModelBinding(key)) {
    throw new Error(`无效的绑定: ${key}（仅支持 @model:供应商/模型）`);
  }

  const flat = profileStore.resolveModelBinding(store, key);
  if (!flat) {
    throw new Error(`未找到模型绑定: ${key}`);
  }

  const kind = String(flat.kind || "api").trim().toLowerCase();
  if (kind === "subscription") {
    const providerId = String(flat.subscription_provider_id || "").trim();
    if (!providerId) {
      throw new Error("订阅供应商缺少 subscription_provider_id");
    }
    const built = subscriptionAuth.buildSubscriptionProfile(
      providerId,
      subscriptionTargetCliForProvider(providerId),
    );
    if (!built?.ok || !built.profile) {
      throw new Error(built?.error || `无法解析订阅: ${providerId}`);
    }
    const p = built.profile;
    return {
      api_style: String(p.api_style || flat.api_style || "").trim(),
      base_url: normalizeBaseUrl(p.base_url),
      api_key: String(p.api_key || "").trim(),
      account_id: String(p.account_id || "").trim(),
      model: String(flat.model || p.model || "").trim(),
      source: `subscription:${providerId}`,
    };
  }

  if (kind === "local") {
    const provider = String(flat.local_provider || "ollama").trim().toLowerCase();
    const defaultBase =
      provider === "ollama" ? "http://127.0.0.1:11434/v1" : normalizeBaseUrl(flat.base_url);
    return {
      api_style: String(flat.api_style || "openai-chat").trim(),
      base_url: normalizeBaseUrl(flat.base_url) || defaultBase,
      api_key: String(flat.api_key || "ollama").trim() || "ollama",
      model: String(flat.model || "").trim() || "llama3.2",
      source: `local:${provider}`,
    };
  }

  return {
    api_style: String(flat.api_style || "").trim(),
    base_url: normalizeBaseUrl(flat.base_url),
    api_key: String(flat.api_key || "").trim(),
    model: String(flat.model || "").trim(),
    source: `model:${flat.name}`,
  };
}

function bindingIngressFromBinding(binding, store) {
  const parsed = profileStore.parseModelBinding(binding);
  if (!parsed) {
    throw new Error(`无效的绑定: ${binding}`);
  }
  const hit = profileStore.findVendorModel(store, parsed.vendorName, parsed.modelId);
  if (!hit) {
    throw new Error(`未找到模型绑定: ${binding}`);
  }
  const providerId = providerRegistry.providerIdFromStoreProfile(hit.vendor);
  if (!providerRegistry.isFixedProviderId(providerId)) {
    throw new Error(`不支持的供应商: ${parsed.vendorName}`);
  }
  const apiStyle = profileStore.normalizeApiStyle(hit.model.api_style);
  return { providerId, modelId: parsed.modelId, apiStyle, binding };
}

function ingressApiStyleForBinding(binding, cliKind, store) {
  try {
    return bindingIngressFromBinding(binding, store).apiStyle;
  } catch {
    if (cliKind === "claude-code" || cliKind === "kimi-code") return "claude";
    if (cliKind === "codex") return "openai-responses";
    return "openai-chat";
  }
}

/** CLI 写入配置时使用的 ingress 协议（与客户端原生协议一致，可与模型表里的 api_style 不同）。 */
function cliIngressStyle(cliKind) {
  const kind = String(cliKind || "").trim();
  if (kind === "claude-code" || kind === "kimi-code") return "claude";
  if (kind === "codex") return "openai-responses";
  return "openai-chat";
}

async function resolveWireModelForStub(hit, parsedModelId) {
  const providerId = providerRegistry.providerIdFromStoreProfile(hit.vendor);
  const parsedId = String(parsedModelId || "").trim();
  let modelId = parsedId;
  let modelWire = String(hit.model.model || parsedId || "").trim();

  if (String(hit.vendor.kind || "").trim().toLowerCase() === "subscription") {
    if (providerId === "claude-code") {
      const { resolveClaudeSubscriptionTestModel } = require("./claude-backend");
      modelWire = await resolveClaudeSubscriptionTestModel(hit.model);
      modelId = modelWire;
    } else if (providerId === "codex") {
      const { resolveCodexSubscriptionTestModel } = require("./codex-backend");
      modelWire = await resolveCodexSubscriptionTestModel(hit.model);
      modelId = modelWire;
    }
  }

  if (!modelWire) modelWire = modelId;
  if (!modelId) modelId = modelWire;
  return { modelId, modelWire };
}

/** 从 @model 绑定生成 OpenCode 等 CLI 应写入的本地 ingress（不创建 __local_proxy_* stub）。 */
async function buildIngressForBinding(cliKind, port, binding, store) {
  const stub = await buildProxyStubProfile(cliKind, port, binding, store);
  const modelId = stub.models?.[0]?.id || stub.model;
  return {
    baseUrl: stub.base_url,
    model: stub.model,
    modelId,
    apiStyle: stub.api_style,
  };
}

async function buildProxyStubProfile(cliKind, port, binding, store) {
  const parsed = profileStore.parseModelBinding(binding);
  if (!parsed) {
    throw new Error(`无效的绑定: ${binding}`);
  }
  let hit = profileStore.findVendorModel(store, parsed.vendorName, parsed.modelId);
  if (!hit && String(parsed.modelId || "").trim().toLowerCase() === "default") {
    const vendor = profileStore.findStoreVendorProfile(store, parsed.vendorName);
    const fallback = vendor?.models?.[0];
    if (vendor && fallback) {
      hit = { vendor, model: fallback };
    }
  }
  if (!hit) {
    throw new Error(`未找到模型绑定: ${binding}`);
  }
  const providerId = providerRegistry.providerIdFromStoreProfile(hit.vendor);
  if (!providerRegistry.isFixedProviderId(providerId)) {
    throw new Error(`不支持的供应商: ${parsed.vendorName}`);
  }
  const ingressStyle = profileStore.normalizeApiStyle(cliIngressStyle(cliKind));
  const { modelId, modelWire } = await resolveWireModelForStub(hit, parsed.modelId);
  return {
    name: `__local_proxy_${cliKind}__`,
    kind: "api",
    cli: cliKind,
    api_style: ingressStyle,
    base_url: providerRegistry.buildProxyIngressBaseUrl(port, providerId, modelId, ingressStyle),
    api_key: "clovapi-local",
    // 顶层 model 供 clovapi switch 写入 ~/.claude/settings.json（与 models[] 一致）
    model: modelWire,
    models: [
      {
        id: modelId,
        label: String(hit.model.label || "").trim() || modelWire,
        model: modelWire,
        api_style: ingressStyle,
      },
    ],
  };
}

function resolveIngressContext(providerId, modelId, ingressApiStyle, store) {
  if (!providerRegistry.isFixedProviderId(providerId)) {
    throw new Error(`不支持的供应商 ID: ${providerId}`);
  }
  const binding = providerRegistry.modelBindingForProvider(providerId, modelId);
  if (!binding) {
    throw new Error(`无法解析模型: ${providerId}/${modelId}`);
  }
  const upstream = resolveBindingUpstream(binding, subscriptionTargetCliForProvider(providerId), store);
  return {
    upstream,
    ingressStyle: profileStore.normalizeApiStyle(ingressApiStyle),
    egressStyle: profileStore.normalizeApiStyle(upstream.api_style),
    binding,
  };
}

/** @deprecated alias */
function resolveIngressUpstream(providerId, modelId, ingressApiStyle, store) {
  return resolveIngressContext(providerId, modelId, ingressApiStyle, store).upstream;
}

/**
 * 旧版 CLI base_url：http://127.0.0.1:port/{cliKind}/v1（无 modelId/apiStyle 段）。
 * 从对应 __local_proxy_{cliKind}__ stub 的完整 base_url 解析上游。
 */
function resolveLegacyCliIngress(pathname, store) {
  const match = String(pathname || "").match(/^\/([^/]+)\/v1(\/.*)?$/i);
  if (!match) return null;
  const cliKind = decodeURIComponent(match[1]);
  const stub = (store.profiles || []).find((p) => p.name === `__local_proxy_${cliKind}__`);
  if (!stub?.base_url) return null;
  let stubIngress;
  try {
    stubIngress = providerRegistry.parseProxyIngressPath(new URL(stub.base_url).pathname);
  } catch {
    return null;
  }
  if (!stubIngress) return null;
  return {
    providerId: stubIngress.providerId,
    modelId: stubIngress.modelId,
    apiStyle: stubIngress.apiStyle,
    pathSuffix: match[2] || "/",
  };
}

function buildUpstreamAuthHeaders(apiStyle, apiKey, upstream = {}) {
  const key = String(apiKey || "").trim();
  const style = String(apiStyle || "").trim().toLowerCase();
  if (style === "claude") {
    if (isClaudeOAuthToken(key)) {
      return buildClaudeOAuthHeaders(key);
    }
    return {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    };
  }
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (style === "openai-responses") {
    const accountId = String(upstream.account_id || "").trim();
    if (accountId) headers["chatgpt-account-id"] = accountId;
    headers["OpenAI-Beta"] = "responses=experimental";
    headers.Originator = "clovapi";
    headers.Accept = "text/event-stream";
  }
  return headers;
}

module.exports = {
  isModelBinding,
  normalizeBaseUrl,
  joinUrl,
  resolveBindingUpstream,
  bindingIngressFromBinding,
  ingressApiStyleForBinding,
  cliIngressStyle,
  buildProxyStubProfile,
  buildIngressForBinding,
  resolveIngressContext,
  resolveIngressUpstream,
  resolveLegacyCliIngress,
  subscriptionTargetCliForProvider,
  buildUpstreamAuthHeaders,
};

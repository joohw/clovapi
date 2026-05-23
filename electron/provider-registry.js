/**
 * 固定四种供应商（providerId），禁止动态注册新供应商类型。
 * 代理路径：/{providerId}/{modelId}/{apiStyle}/v1/…
 * CLI base_url 只到 /{apiStyle}；客户端自己会追加 /v1/…
 */

const OLLAMA_PROFILE_NAME = "Ollama";
const CUSTOM_API_PROFILE_NAME = "Custom API";

const FIXED_PROVIDER_IDS = Object.freeze(["claude-code", "codex", "ollama", "custom-api"]);

const PROVIDER_REGISTRY = Object.freeze([
  {
    id: "claude-code",
    vendorName: "Claude Subscription",
    kind: "subscription",
    subscriptionProviderId: "claude-code",
  },
  {
    id: "codex",
    vendorName: "Codex Subscription",
    kind: "subscription",
    subscriptionProviderId: "codex",
  },
  {
    id: "ollama",
    vendorName: OLLAMA_PROFILE_NAME,
    kind: "local",
    localProvider: "ollama",
  },
  {
    id: "custom-api",
    vendorName: CUSTOM_API_PROFILE_NAME,
    kind: "api",
  },
]);

const PROVIDER_BY_ID = Object.fromEntries(PROVIDER_REGISTRY.map((item) => [item.id, item]));
const VENDOR_NAME_TO_PROVIDER_ID = Object.fromEntries(
  PROVIDER_REGISTRY.map((item) => [item.vendorName.toLowerCase(), item.id]),
);

function isFixedProviderId(providerId) {
  return FIXED_PROVIDER_IDS.includes(String(providerId || "").trim());
}

function providerIdFromVendorName(vendorName) {
  return VENDOR_NAME_TO_PROVIDER_ID[String(vendorName || "").trim().toLowerCase()] || "";
}

function vendorNameFromProviderId(providerId) {
  return PROVIDER_BY_ID[String(providerId || "").trim()]?.vendorName || "";
}

const MODEL_BINDING_PREFIX = "@model:";

function modelBindingForProvider(providerId, modelId) {
  const vendorName = vendorNameFromProviderId(providerId);
  if (!vendorName) return "";
  return `${MODEL_BINDING_PREFIX}${vendorName}/${String(modelId || "").trim()}`;
}

function providerIdFromStoreProfile(profile) {
  if (!profile) return "";
  const kind = String(profile.kind || "api").trim().toLowerCase();
  if (kind === "subscription") {
    const subId = String(profile.subscription_provider_id || "").trim();
    if (subId === "claude-code" || subId === "codex") return subId;
    const byName = providerIdFromVendorName(profile.name);
    if (byName === "claude-code" || byName === "codex") return byName;
    return "";
  }
  if (kind === "local") {
    const name = String(profile.name || "").trim().toLowerCase();
    if (name === OLLAMA_PROFILE_NAME.toLowerCase()) return "ollama";
    return "";
  }
  if (kind === "api") {
    const name = String(profile.name || "").trim().toLowerCase();
    if (name === CUSTOM_API_PROFILE_NAME.toLowerCase()) return "custom-api";
    return "";
  }
  return "";
}

function isLocalProxyStubProfileName(name) {
  return String(name || "").startsWith("__local_proxy_");
}

function isInternalStoreProfileName(name) {
  const key = String(name || "").trim();
  if (!key.startsWith("__")) return false;
  return isLocalProxyStubProfileName(key) || key === "__claude_subscription__" || key === "__codex_subscription__";
}

function isAllowedUserVendorProfile(profile) {
  if (!profile) return false;
  const name = String(profile.name || "").trim();
  if (!name || isInternalStoreProfileName(name)) return false;
  return Boolean(providerIdFromStoreProfile(profile));
}

function isAllowedStoreProfile(profile) {
  if (!profile) return false;
  const name = String(profile.name || "").trim();
  if (!name) return false;
  if (isInternalStoreProfileName(name)) return true;
  return isAllowedUserVendorProfile(profile);
}

function buildProxyIngressBaseUrl(port, providerId, modelId, apiStyle) {
  const host = "127.0.0.1";
  const encModel = encodeURIComponent(String(modelId || "").trim());
  const style = String(apiStyle || "").trim().toLowerCase();
  return `http://${host}:${Number(port) || 27483}/${providerId}/${encModel}/${style}`;
}

function parseProxyIngressPath(pathname) {
  const path = String(pathname || "");
  const match = path.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/v1(\/.*)?$/i);
  if (!match) return null;
  const providerId = decodeURIComponent(match[1]);
  const modelId = decodeURIComponent(match[2]);
  const apiStyle = decodeURIComponent(match[3]).toLowerCase();
  const pathSuffix = match[4] || "/";
  return { providerId, modelId, apiStyle, pathSuffix };
}

module.exports = {
  FIXED_PROVIDER_IDS,
  PROVIDER_REGISTRY,
  OLLAMA_PROFILE_NAME,
  CUSTOM_API_PROFILE_NAME,
  isFixedProviderId,
  providerIdFromVendorName,
  vendorNameFromProviderId,
  modelBindingForProvider,
  providerIdFromStoreProfile,
  isLocalProxyStubProfileName,
  isInternalStoreProfileName,
  isAllowedUserVendorProfile,
  isAllowedStoreProfile,
  buildProxyIngressBaseUrl,
  parseProxyIngressPath,
};

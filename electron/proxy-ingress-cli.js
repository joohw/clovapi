/**
 * Ingress URL + CLI stub profiles for local Go core proxy ({providerId}/{modelId}/{apiStyle}).
 * No HTTP/protocol conversion — Electron only persists config matching the Go router shape.
 */
const providerRegistry = require("./provider-registry");

function loadProfileStore() {
  return require("./profile-store");
}

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

async function buildProxyStubProfile(cliKind, port, binding, store) {
  const profileStore = loadProfileStore();
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

function defaultProxyTestApiStyle(vendor, model, providerId) {
  const fromModel = String(model?.api_style || "").trim();
  if (fromModel) return loadProfileStore().normalizeApiStyle(fromModel);
  if (providerId === "claude-code") return "claude";
  if (providerId === "codex") return "openai-responses";
  return "openai-chat";
}

/** Profile for connectivity probe via local Go proxy (shows up in call logs). */
async function buildProxyTestProfile(vendor, model, port) {
  const hit = { vendor, model };
  const providerId = providerRegistry.providerIdFromStoreProfile(vendor);
  if (!providerRegistry.isFixedProviderId(providerId)) {
    throw new Error(`不支持的供应商: ${vendor?.name || "(unnamed)"}`);
  }
  const parsedModelId = String(model?.id || model?.model || "").trim();
  const apiStyle = defaultProxyTestApiStyle(vendor, model, providerId);
  const { modelId, modelWire } = await resolveWireModelForStub(hit, parsedModelId);
  return {
    name: `${vendor.name}/${modelId}`,
    kind: vendor.kind,
    api_style: apiStyle,
    base_url: providerRegistry.buildProxyIngressBaseUrl(port, providerId, modelId, apiStyle),
    api_key: "clovapi-local",
    model: modelWire,
  };
}

module.exports = {
  cliIngressStyle,
  buildProxyStubProfile,
  buildIngressForBinding,
  buildProxyTestProfile,
};

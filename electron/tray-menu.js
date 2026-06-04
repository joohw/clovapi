const VALID_TABS = new Set(["cli", "profiles", "call-logs", "sessions", "system-logs", "settings"]);
const TRAY_CLI_ORDER = ["claude-code", "claudedesktop", "codex", "hermes", "opencode", "openclaw", "kimi-code"];
const CLI_LABELS = {
  "claude-code": "Claude Code",
  claudedesktop: "Claude Desktop",
  codex: "Codex",
  hermes: "Hermes",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  "kimi-code": "Kimi Code",
};
const PROVIDER_LABELS = {
  "claude-code": "Claude Subscription",
  codex: "Codex Subscription",
  ollama: "Ollama",
  "custom-api": "Custom API",
};
const API_STYLES = new Set(["claude", "openai-responses", "openai-chat", "gemini"]);

function isValidTrayTab(tab) {
  return VALID_TABS.has(String(tab || "").trim());
}

function trayStatusSummary(state = {}) {
  const running = Boolean(state.running);
  const port = Number(state.port) || 27483;
  const external = Boolean(state.external);
  const managed = Boolean(state.managed);
  const error = String(state.error || "").trim();

  if (running) {
    const owner = external ? "external" : managed ? "managed" : "active";
    return `Proxy running on :${port} (${owner})`;
  }
  if (error) {
    return `Proxy stopped · ${error}`;
  }
  return `Proxy stopped on :${port}`;
}

function trayTooltip(summary) {
  const detail = String(summary || "").trim();
  return detail ? `ClovAPI Switcher — ${detail}` : "ClovAPI Switcher";
}

function providerLabel(providerId) {
  const key = String(providerId || "").trim();
  return PROVIDER_LABELS[key] || key || "Unknown Provider";
}

function cliLabel(kind) {
  const key = String(kind || "").trim();
  return CLI_LABELS[key] || key || "Unknown CLI";
}

function apiStylesForCli(kind) {
  if (kind === "claude-code" || kind === "claudedesktop") return ["claude"];
  if (kind === "codex") return ["openai-responses"];
  if (kind === "hermes" || kind === "kimi-code" || kind === "opencode" || kind === "openclaw") {
    return ["claude", "openai-responses", "openai-chat", "gemini"];
  }
  return [];
}

function modelCompatibleWithCli(model, kind) {
  const apiStyle = String(model?.apiStyle || model?.api_style || "").trim();
  return apiStylesForCli(kind).length > 0 && (!apiStyle || API_STYLES.has(apiStyle));
}

function providerIdForVendor(vendor) {
  if (!vendor || typeof vendor !== "object") return "";
  if (vendor.kind === "subscription") {
    return String(vendor.subscriptionProviderId || "").trim();
  }
  if (vendor.kind === "local" && String(vendor.localProvider || "").trim().toLowerCase() === "ollama") {
    return "ollama";
  }
  if (vendor.kind === "api" && String(vendor.name || "").trim().toLowerCase() === "custom api") {
    return "custom-api";
  }
  return "";
}

function activeSelectionParts(value) {
  if (!value || typeof value !== "object") return { providerId: "", modelId: "" };
  return {
    providerId: String(value.provider_id || value.providerId || "").trim(),
    modelId: String(value.model_id || value.modelId || "").trim(),
  };
}

function findVendorByProviderId(profiles, providerId) {
  const key = String(providerId || "").trim();
  return (
    (Array.isArray(profiles) ? profiles : []).find((vendor) => {
      if (!vendor || typeof vendor !== "object") return false;
      if (vendor.kind === "subscription") {
        return String(vendor.subscriptionProviderId || "").trim() === key;
      }
      if (vendor.kind === "local") {
        return key === "ollama" && String(vendor.localProvider || "").trim().toLowerCase() === "ollama";
      }
      if (vendor.kind === "api") {
        return key === "custom-api" && String(vendor.name || "").trim().toLowerCase() === "custom api";
      }
      return false;
    }) || null
  );
}

function modelMenuOptionsForCli(profiles, cliKind, activeSelection) {
  const activeKey = `${activeSelection.providerId}/${activeSelection.modelId}`;
  return (Array.isArray(profiles) ? profiles : []).flatMap((vendor) => {
    const providerId = providerIdForVendor(vendor);
    if (!providerId) return [];
    return (Array.isArray(vendor.models) ? vendor.models : [])
      .filter((model) => modelCompatibleWithCli(model, cliKind))
      .map((model) => {
        const modelId = String(model?.id || "").trim();
        const modelLabel = String(model?.label || model?.model || modelId || "default").trim() || "default";
        const key = `${providerId}/${modelId}`;
        return {
          providerId,
          modelId,
          label: `${String(vendor.name || providerLabel(providerId)).trim()} / ${modelLabel}`,
          checked: key === activeKey,
        };
      })
      .filter((option) => option.providerId && option.modelId);
  });
}

function modelLabelForVendor(vendor, modelId) {
  const key = String(modelId || "").trim();
  if (!vendor || !key) return key || "default";
  const match = Array.isArray(vendor.models)
    ? vendor.models.find((model) => String(model?.id || "").trim() === key)
    : null;
  return String(match?.label || match?.model || key || "default").trim() || "default";
}

function installedByKindFromAgents(agents) {
  const map = {};
  for (const item of Array.isArray(agents) ? agents : []) {
    const kind = String(item?.kind || "").trim();
    if (!kind) continue;
    map[kind] = Boolean(item.installed);
  }
  return map;
}

function resolveTrayAgentBindings(state = {}, installedByKind = {}) {
  const active = state.active && typeof state.active === "object" ? state.active : {};
  const profiles = Array.isArray(state.profiles) ? state.profiles : [];
  const out = [];

  for (const kind of TRAY_CLI_ORDER) {
    if (!installedByKind[kind]) continue;
    const selection = activeSelectionParts(active[kind]);
    const vendor = selection.providerId ? findVendorByProviderId(profiles, selection.providerId) : null;
    const vendorName = String(vendor?.name || (selection.providerId ? providerLabel(selection.providerId) : "")).trim();
    const modelLabel = selection.modelId ? modelLabelForVendor(vendor, selection.modelId) : "";
    out.push({
      cliKind: kind,
      cliLabel: cliLabel(kind),
      installed: true,
      providerId: selection.providerId,
      vendorName,
      modelId: selection.modelId,
      modelLabel,
      summaryLabel: modelLabel ? `${cliLabel(kind)} · ${modelLabel}` : cliLabel(kind),
      detailLabel:
        selection.providerId && selection.modelId && vendorName
          ? `${vendorName} / ${modelLabel}`
          : "No model selected",
      modelOptions: modelMenuOptionsForCli(profiles, kind, selection),
    });
  }

  return out;
}

function buildTrayMenuModel(state = {}) {
  const running = Boolean(state.running);
  const port = Number(state.port) || 27483;
  const installedByKind =
    state.installedByKind && typeof state.installedByKind === "object"
      ? state.installedByKind
      : installedByKindFromAgents(state.agents);
  const bindings = resolveTrayAgentBindings(state, installedByKind);

  return {
    windowLabel: "Show ClovAPI Switcher",
    profilesLabel: "Open Profiles",
    settingsLabel: "Open Settings",
    logsLabel: "Open Call Logs",
    statusLabel: trayStatusSummary(state),
    bindings,
    hasBindings: bindings.length > 0,
    noAgentsLabel: "No installed agents",
    startProxyLabel: `Start Proxy on :${port}`,
    canStartProxy: !running,
    quitLabel: "Quit ClovAPI Switcher",
  };
}

module.exports = {
  buildTrayMenuModel,
  installedByKindFromAgents,
  isValidTrayTab,
  resolveTrayAgentBindings,
  trayStatusSummary,
  trayTooltip,
};

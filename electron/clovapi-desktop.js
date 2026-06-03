const { runClovapiArgsAsync, runClovapiLongAsync, cancelClovapiLongRun } = require("./clovapi-exec");

const AUTH_PROVIDERS = new Set(["claude-code", "codex"]);
const AUTH_LOGIN_TIMEOUT = 10 * 60 * 1000;

let outputHandler = () => {};

function setOutputHandler(handler) {
  outputHandler = typeof handler === "function" ? handler : () => {};
}

function parseCliJSON(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    return { ok: false, error: result.stderr || "empty response from clovapi" };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid JSON from clovapi" };
  }
}

async function runAuthAsync(args, options = {}) {
  const result = await runClovapiArgsAsync(["auth", ...args, "--json"], {
    timeout: options.timeout ?? 30000,
    input: options.input,
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    return { ok: false, error: "clovapi auth timed out" };
  }
  if (!result.ok) {
    const message = String(result.stderr || result.stdout || "clovapi auth failed").trim();
    return { ok: false, error: message || "clovapi auth failed" };
  }
  return parseCliJSON(result);
}

async function runProfilesAsync(args, options = {}) {
  const result = await runClovapiArgsAsync(["profiles", ...args, "--json"], {
    timeout: options.timeout ?? 30000,
    input: options.input,
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    return { ok: false, error: "clovapi profiles timed out" };
  }
  if (!result.ok) {
    const message = String(result.stderr || result.stdout || "clovapi profiles failed").trim();
    return { ok: false, error: message || "clovapi profiles failed" };
  }
  return parseCliJSON(result);
}

async function runDesktopAsync(args, options = {}) {
  const result = await runClovapiArgsAsync(["desktop", ...args], {
    timeout: options.timeout ?? 30000,
    input: options.input,
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    return { ok: false, error: "clovapi desktop timed out" };
  }
  if (!result.ok) {
    const message = String(result.stderr || result.stdout || "clovapi desktop failed").trim();
    return { ok: false, error: message || "clovapi desktop failed" };
  }
  return parseCliJSON(result);
}

function loadProfiles() {
  return runProfilesAsync(["load"]);
}

function loadProxyConfig() {
  return runDesktopAsync(["proxy", "load"], { timeout: 10000 });
}

function saveProxyConfig(payload) {
  return runDesktopAsync(["proxy", "save"], {
    input: JSON.stringify(payload || {}),
    timeout: 10000,
  });
}

function saveProfiles(payload) {
  return runProfilesAsync(["save"], {
    input: JSON.stringify(payload || {}),
    timeout: 15000,
  });
}

async function switchProviderModel(cliKind, providerId, modelId) {
  const result = await runClovapiArgsAsync(
    [
      "switch",
      "--cli",
      String(cliKind || ""),
      "--provider",
      String(providerId || ""),
      "--model",
      String(modelId || ""),
      "--json",
    ],
    { timeout: 45000 },
  );
  if (result.error && result.error.code === "ETIMEDOUT") {
    return { ok: false, error: "clovapi switch timed out" };
  }
  if (!result.ok) {
    const message = String(result.stderr || result.stdout || "clovapi switch failed").trim();
    return { ok: false, error: message || "clovapi switch failed" };
  }
  return parseCliJSON(result);
}

function listVendorModels(vendorName) {
  return runProfilesAsync(["list-models", "--vendor", String(vendorName || "")], {
    timeout: 45000,
  });
}

async function testBinding(payload) {
  const binding = String(payload?.binding || "").trim();
  const provider = String(payload?.provider || payload?.provider_id || "").trim();
  const model = String(payload?.model || payload?.model_id || "").trim();
  const args = ["test"];
  if (provider || model) {
    args.push("--provider", provider, "--model", model);
  } else {
    args.push("--binding", binding);
  }
  const cli = String(payload?.cli || "").trim();
  if (cli) {
    args.push("--cli", cli);
  }
  const port = Number(payload?.proxy?.port);
  if (Number.isFinite(port) && port > 0) {
    args.push("--port", String(port));
  }
  return runProfilesAsync(args, { timeout: 130000 });
}

function modelAdapters() {
  return runProfilesAsync(["catalog"], { timeout: 10000 });
}

function vendorCatalog() {
  return modelAdapters();
}

function whichCommand(command) {
  return runDesktopAsync(["agents", "which", "--command", String(command || "")], { timeout: 10000 });
}

function agentStatus() {
  return runDesktopAsync(["agents", "status"], { timeout: 10000 });
}

function agentInstall(kind) {
  return runDesktopAsync(["agents", "install", "--cli", String(kind || "")], { timeout: 10 * 60 * 1000 });
}

function agentUninstall(kind) {
  return runDesktopAsync(["agents", "uninstall", "--cli", String(kind || "")], { timeout: 10 * 60 * 1000 });
}

function authLoginEnv() {
  const bypass = ["127.0.0.1", "localhost", "::1"].join(",");
  const merge = (value) => {
    const current = String(value || "").trim();
    if (!current) return bypass;
    const parts = current.split(",").map((part) => part.trim()).filter(Boolean);
    for (const host of bypass.split(",")) {
      if (!parts.some((part) => part.toLowerCase() === host.toLowerCase())) parts.push(host);
    }
    return parts.join(",");
  };
  return {
    ...process.env,
    NO_PROXY: merge(process.env.NO_PROXY),
    no_proxy: merge(process.env.no_proxy),
  };
}
function authStatus() {
  return runAuthAsync(["status"]);
}

async function authLogin(provider) {
  const providerId = String(provider || "").trim();
  if (!AUTH_PROVIDERS.has(providerId)) {
    return { ok: false, error: `未知订阅类型: ${providerId}` };
  }
  const result = await runClovapiLongAsync(["auth", "login", "--provider", providerId, "--json"], {
    cancelKey: providerId,
    onOutput: outputHandler,
    timeout: AUTH_LOGIN_TIMEOUT,
    env: authLoginEnv(),
  });
  if (result.cancelled) {
    return { ok: false, cancelled: true, error: "已取消登录" };
  }
  if (!result.ok) {
    const message = String(result.stderr || result.stdout || "登录失败").trim();
    return { ok: false, error: message || "登录失败" };
  }
  return parseCliJSON(result);
}

function cancelAuthLogin(provider) {
  const providerId = String(provider || "").trim();
  const result = cancelClovapiLongRun(providerId);
  if (!result.ok) {
    return { ok: false, error: "该订阅未在登录中" };
  }
  return { ok: true };
}

function authLogout(provider) {
  return runAuthAsync(["logout", "--provider", String(provider || "")], { timeout: 15000 });
}

function queryVendorUsage(vendorName) {
  return runProfilesAsync(["usage", "--vendor", String(vendorName || "")], {
    timeout: 20000,
  });
}

module.exports = {
  setOutputHandler,
  runDesktopAsync,
  runProfilesAsync,
  loadProfiles,
  loadProxyConfig,
  saveProxyConfig,
  saveProfiles,
  switchProviderModel,
  listVendorModels,
  testBinding,
  modelAdapters,
  vendorCatalog,
  whichCommand,
  agentStatus,
  agentInstall,
  agentUninstall,
  authStatus,
  authLogin,
  cancelAuthLogin,
  authLogout,
  queryVendorUsage,
};

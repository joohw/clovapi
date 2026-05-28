const { runClovapiArgsAsync } = require("./clovapi-exec");

function parseDesktopStdout(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    return { ok: false, error: result.stderr || "empty response from clovapi desktop" };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid JSON from clovapi desktop" };
  }
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
  return parseDesktopStdout(result);
}

function loadProfiles() {
  return runDesktopAsync(["profiles", "load"]);
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
  return runDesktopAsync(["profiles", "save"], {
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
  return { ok: true, stdout: result.stdout, stderr: result.stderr };
}

function listVendorModels(vendorName) {
  return runDesktopAsync(["vendor", "list-models", "--vendor", String(vendorName || "")], {
    timeout: 45000,
  });
}

async function testBinding(payload) {
  const binding = String(payload?.binding || "").trim();
  const provider = String(payload?.provider || payload?.provider_id || "").trim();
  const model = String(payload?.model || payload?.model_id || "").trim();
  const args = ["profiles", "test"];
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
  return runDesktopAsync(args, { timeout: 130000 });
}

function modelAdapters() {
  return runDesktopAsync(["vendor", "catalog"], { timeout: 10000 });
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

function authStatus() {
  return runDesktopAsync(["auth", "status"], { timeout: 10000 });
}

function authLogout(provider) {
  return runDesktopAsync(["auth", "logout", "--provider", String(provider || "")], {
    timeout: 15000,
  });
}

function queryVendorUsage(vendorName) {
  return runDesktopAsync(["vendor", "usage", "--vendor", String(vendorName || "")], {
    timeout: 20000,
  });
}

module.exports = {
  runDesktopAsync,
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
  authStatus,
  authLogout,
  queryVendorUsage,
};

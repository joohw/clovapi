const { runClovapiArgs } = require("./clovapi-exec");

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

function runDesktop(args, options = {}) {
  const result = runClovapiArgs(["desktop", ...args], {
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
  return runDesktop(["profiles", "load"]);
}

function loadProxyConfig() {
  return runDesktop(["proxy", "load"], { timeout: 10000 });
}

function saveProxyConfig(payload) {
  return runDesktop(["proxy", "save"], {
    input: JSON.stringify(payload || {}),
    timeout: 10000,
  });
}

function saveProfiles(payload) {
  return runDesktop(["profiles", "save"], {
    input: JSON.stringify(payload || {}),
    timeout: 15000,
  });
}

function listVendorModels(vendorName) {
  return runDesktop(["vendor", "list-models", "--vendor", String(vendorName || "")], {
    timeout: 45000,
  });
}

function testBinding(payload) {
  const binding = String(payload?.binding || "").trim();
  const args = ["profiles", "test", "--binding", binding];
  const port = Number(payload?.proxy?.port);
  if (Number.isFinite(port) && port > 0) {
    args.push("--port", String(port));
  }
  return runDesktop(args, { timeout: 45000 });
}

function modelAdapters() {
  return runDesktop(["vendor", "catalog"], { timeout: 10000 });
}

function vendorCatalog() {
  return modelAdapters();
}

function authStatus() {
  return runDesktop(["auth", "status"], { timeout: 10000 });
}

function authLogout(provider) {
  return runDesktop(["auth", "logout", "--provider", String(provider || "")], {
    timeout: 15000,
  });
}

module.exports = {
  runDesktop,
  loadProfiles,
  loadProxyConfig,
  saveProxyConfig,
  saveProfiles,
  listVendorModels,
  testBinding,
  modelAdapters,
  vendorCatalog,
  authStatus,
  authLogout,
};

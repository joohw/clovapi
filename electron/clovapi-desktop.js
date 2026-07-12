const { runClovapiArgsAsync, runClovapiLongAsync, cancelClovapiLongRun } = require("./clovapi-exec");
const { spawn } = require("node:child_process");

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

function listVendorModels(vendorName, credentialRef = "") {
  const args = ["list-models", "--vendor", String(vendorName || "")];
  if (String(credentialRef || "").trim()) args.push("--credential-ref", String(credentialRef).trim());
  return runProfilesAsync(args, {
    timeout: 45000,
  });
}

function listModels() {
  return runProfilesAsync(["models"], { timeout: 15000 });
}

async function testBinding(payload) {
  const provider = String(payload?.provider || payload?.provider_id || "").trim();
  const model = String(payload?.model || payload?.model_id || "").trim();
  const args = ["test"];
  args.push("--provider", provider, "--model", model);
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
  const name = String(command || "").trim();
  if (!name) return Promise.resolve({ ok: false, exists: false, path: "" });
  const tool = process.platform === "win32" ? "where.exe" : "which";
  return new Promise((resolve) => {
    const child = spawn(tool, [name], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, exists: false, path: "", error: "which timed out" });
    }, 10000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, exists: false, path: "", error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
      resolve({
        ok: code === 0,
        exists: code === 0 && Boolean(first),
        path: first,
        error: code === 0 ? "" : String(stderr || stdout || "").trim(),
      });
    });
  });
}

function mergeNoProxy(value) {
  const bypass = ["127.0.0.1", "localhost", "::1"];
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const host of bypass) {
    if (!parts.some((part) => part.toLowerCase() === host.toLowerCase())) parts.push(host);
  }
  return parts.join(",");
}

function authLoginEnv() {
  const env = { ...process.env };
  env.NO_PROXY = mergeNoProxy(env.NO_PROXY);
  env.no_proxy = mergeNoProxy(env.no_proxy);
  return env;
}

function authStatus() {
  return runAuthAsync(["status"]);
}

async function authLogin(payload) {
  const providerId = String(typeof payload === "string" ? payload : payload?.provider || "").trim();
  const credentialRef = String(typeof payload === "string" ? "" : payload?.credentialRef || "").trim();
  if (!AUTH_PROVIDERS.has(providerId)) {
    return { ok: false, error: `未知订阅类型: ${providerId}` };
  }
  const args = ["auth", "login", "--provider", providerId, "--json"];
  if (credentialRef) args.push("--credential-ref", credentialRef);
  const result = await runClovapiLongAsync(args, {
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

function queryVendorUsage(vendorName, credentialRef = "") {
  const args = ["usage", "--vendor", String(vendorName || "")];
  if (String(credentialRef || "").trim()) args.push("--credential-ref", String(credentialRef).trim());
  return runProfilesAsync(args, {
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
  listVendorModels,
  listModels,
  testBinding,
  modelAdapters,
  vendorCatalog,
  whichCommand,
  authStatus,
  authLogin,
  cancelAuthLogin,
  authLogout,
  queryVendorUsage,
  mergeNoProxy,
  authLoginEnv,
};

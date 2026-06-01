const { runClovapiArgsAsync, readCoreExecutableVersion, resolveClovapiExecutable } = require("./clovapi-exec");
const clovapiDesktop = require("./clovapi-desktop");

const DEFAULT_PORT = 27483;
const DEFAULT_HOST = "127.0.0.1";

function normalizeHost(host) {
  const raw = String(host || "").trim() || DEFAULT_HOST;
  const lower = raw.toLowerCase();
  if (lower === "0.0.0.0" || lower === "::" || lower === "::ffff:0.0.0.0") {
    return DEFAULT_HOST;
  }
  return raw;
}

function normalizePort(port) {
  const value = Number(port);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PORT;
}

function buildProxyStartArgs(cfg) {
  const host = normalizeHost(cfg?.host);
  const port = normalizePort(cfg?.port);
  return {
    host,
    port,
    args: ["proxy", "start", "--host", host, "--port", String(port)],
  };
}

function buildProxyStopArgs(cfg) {
  const host = normalizeHost(cfg?.host);
  const port = normalizePort(cfg?.port);
  return {
    host,
    port,
    args: ["proxy", "stop", "--host", host, "--port", String(port)],
  };
}

function buildProxyStatusArgs(cfg) {
  const host = normalizeHost(cfg?.host);
  const port = normalizePort(cfg?.port);
  return {
    host,
    port,
    args: ["proxy", "status", "--json", "--host", host, "--port", String(port)],
  };
}

function buildProxyHealthArgs(cfg) {
  const host = normalizeHost(cfg?.host);
  const port = normalizePort(cfg?.port);
  return {
    host,
    port,
    args: ["proxy", "health", "--json", "--host", host, "--port", String(port)],
  };
}

function parseProxyStatusStdout(result) {
  const text = String(result?.stdout || "").trim();
  if (!text) {
    return {
      ok: false,
      running: false,
      passed: false,
      error: String(result?.stderr || "empty proxy status response").trim() || "empty proxy status response",
    };
  }
  try {
    const parsed = JSON.parse(text);
    return {
      ok: parsed?.ok !== false,
      running: Boolean(parsed?.running),
      passed: Boolean(parsed?.passed ?? parsed?.running),
      host: normalizeHost(parsed?.host),
      port: normalizePort(parsed?.port),
      baseUrl: String(parsed?.baseUrl || "").trim(),
      healthUrl: String(parsed?.healthUrl || "").trim(),
      body: parsed?.body ?? null,
      latencyMs: Number(parsed?.latencyMs) || 0,
      error: String(parsed?.error || "").trim(),
    };
  } catch {
    return { ok: false, running: false, passed: false, error: "invalid proxy status JSON" };
  }
}

async function runProxyCLI(args, timeout = 45000) {
  const result = await runClovapiArgsAsync(args, { timeout });
  if (result.error && result.error.code === "ETIMEDOUT") {
    return { ok: false, error: "clovapi proxy command timed out" };
  }
  if (!result.ok) {
    const message = String(result.stderr || result.stdout || "clovapi proxy command failed").trim();
    return { ok: false, error: message || "clovapi proxy command failed", stdout: result.stdout, stderr: result.stderr };
  }
  return { ok: true, stdout: result.stdout, stderr: result.stderr };
}

function createClovapiProxy() {
  let autostartSuppressed = false;
  let consecutiveStartFailures = 0;
  const maxAutostartAttempts = 3;

  async function loadProxyConfigFromDisk() {
    const result = await clovapiDesktop.loadProxyConfig();
    if (!result?.ok) {
      throw new Error(String(result?.error || "failed to load proxy config"));
    }
    const cfg = result.proxy && typeof result.proxy === "object" ? result.proxy : {};
    return {
      enabled: cfg.enabled !== false,
      host: normalizeHost(cfg.host),
      port: normalizePort(cfg.port),
    };
  }

  async function loadProxyConfig() {
    return loadProxyConfigFromDisk();
  }

  function defaultProxyConfig() {
    return { enabled: true, host: DEFAULT_HOST, port: DEFAULT_PORT };
  }

  async function saveProxyConfig(patch) {
    const current = await loadProxyConfigFromDisk();
    const merged = { ...current, ...patch };
    const result = await clovapiDesktop.saveProxyConfig({
      enabled: merged.enabled !== false,
      host: normalizeHost(merged.host),
      port: normalizePort(merged.port),
    });
    if (!result?.ok) {
      throw new Error(String(result?.error || "failed to save proxy config"));
    }
    const cfg = result.proxy && typeof result.proxy === "object" ? result.proxy : merged;
    return {
      enabled: cfg.enabled !== false,
      host: normalizeHost(cfg.host),
      port: normalizePort(cfg.port),
    };
  }

  async function fetchStatus(cfg) {
    const args = buildProxyStatusArgs(cfg).args;
    const result = await runProxyCLI(args, 10000);
    if (!result.ok) {
      return {
        ok: true,
        running: false,
        passed: false,
        host: normalizeHost(cfg.host),
        port: normalizePort(cfg.port),
        baseUrl: `http://${normalizeHost(cfg.host)}:${normalizePort(cfg.port)}`,
        error: result.error,
      };
    }
    return parseProxyStatusStdout(result);
  }

  async function status() {
    const cfg = await loadProxyConfig();
    const snapshot = await fetchStatus(cfg);
    return {
      ok: true,
      running: Boolean(snapshot.running),
      managed: false,
      pid: null,
      port: snapshot.port || cfg.port,
      host: snapshot.host || cfg.host,
      baseUrl: snapshot.baseUrl || `http://${cfg.host}:${cfg.port}`,
      error: snapshot.error || "",
    };
  }

  async function probeHealth() {
    const cfg = await loadProxyConfig();
    const args = buildProxyHealthArgs(cfg).args;
    const result = await runProxyCLI(args, 10000);
    if (!result.ok) {
      return {
        ok: true,
        passed: false,
        url: buildProxyHealthArgs(cfg).args.includes("--json") ? "" : "",
        latencyMs: 0,
        body: null,
        error: result.error,
      };
    }
    const snapshot = parseProxyStatusStdout(result);
    return {
      ok: true,
      passed: Boolean(snapshot.passed),
      url: snapshot.healthUrl,
      latencyMs: snapshot.latencyMs,
      body: snapshot.body,
      error: snapshot.passed ? "" : snapshot.error || "health failed",
    };
  }

  async function maybeReplaceStaleDevProxy(cfg) {
    if (process.env.ELECTRON_DEV !== "1") return;
    const snapshot = await fetchStatus(cfg);
    if (!snapshot.running) return;
    const runningVersion = String(snapshot.body?.version || "").trim();
    if (!runningVersion) return;
    const exe = resolveClovapiExecutable();
    const targetVersion = readCoreExecutableVersion(exe);
    if (!targetVersion || runningVersion === targetVersion) return;
    await runProxyCLI(buildProxyStopArgs(cfg).args);
  }

  async function start(options = {}) {
    autostartSuppressed = false;
    consecutiveStartFailures = 0;
    const cfg = await loadProxyConfig();
    const merged = {
      ...cfg,
      ...(Number(options.port) > 0 ? { port: Number(options.port) } : {}),
      ...(String(options.host || "").trim() ? { host: String(options.host).trim() } : {}),
    };
    const before = await fetchStatus(merged);
    await maybeReplaceStaleDevProxy(merged);
    const exe = resolveClovapiExecutable();
    if (!exe) {
      return {
        ok: false,
        running: Boolean(before.running),
        managed: false,
        pid: null,
        port: merged.port,
        host: merged.host,
        baseUrl: before.baseUrl || `http://${merged.host}:${merged.port}`,
        error: "clovapi executable not found (bundle or PATH)",
      };
    }
    const startResult = await runProxyCLI(buildProxyStartArgs(merged).args, 60000);
    if (!startResult.ok) {
      consecutiveStartFailures += 1;
      const after = await fetchStatus(merged);
      return {
        ok: false,
        running: Boolean(after.running),
        managed: false,
        pid: null,
        port: merged.port,
        host: merged.host,
        baseUrl: after.baseUrl || `http://${merged.host}:${merged.port}`,
        error: startResult.error,
        autostartBlocked: consecutiveStartFailures >= maxAutostartAttempts,
      };
    }
    const after = await fetchStatus(merged);
    return {
      ok: Boolean(after.running),
      alreadyRunning: Boolean(before.running),
      running: Boolean(after.running),
      managed: false,
      pid: null,
      external: Boolean(after.running),
      port: merged.port,
      host: merged.host,
      baseUrl: after.baseUrl || `http://${merged.host}:${merged.port}`,
      error: after.running ? "" : after.error || "proxy health check failed after start",
    };
  }

  async function stop(options = {}) {
    const suppressAutostart = options.suppressAutostart !== false;
    if (suppressAutostart) autostartSuppressed = true;
    consecutiveStartFailures = 0;
    const cfg = await loadProxyConfig();
    await runProxyCLI(buildProxyStopArgs(cfg).args, 60000);
    const after = await fetchStatus(cfg);
    return {
      ok: true,
      running: Boolean(after.running),
      managed: false,
      killedManaged: false,
      autostartSuppressed: suppressAutostart,
      port: cfg.port,
      host: cfg.host,
      baseUrl: after.baseUrl || `http://${cfg.host}:${cfg.port}`,
    };
  }

  function isAutostartSuppressed() {
    return autostartSuppressed;
  }

  async function autostartIfAllowed(payload = {}) {
    if (autostartSuppressed) {
      return { ok: true, running: false, skipped: true, reason: "user-stopped" };
    }
    if (consecutiveStartFailures >= maxAutostartAttempts) {
      return { ok: false, running: false, skipped: true, reason: "start-failures-capped" };
    }
    const cfg = await loadProxyConfig();
    if (cfg.enabled === false) {
      return { ok: true, running: false, skipped: true, reason: "proxy-disabled" };
    }
    return start(payload);
  }

  async function ensureRunning(payload = {}) {
    const started = await start(payload);
    return {
      ok: Boolean(started.ok || started.running),
      running: Boolean(started.running),
      managed: false,
      pid: null,
      port: started.port,
      host: started.host,
      baseUrl: started.baseUrl,
      error: started.error || "",
    };
  }

  return {
    DEFAULT_PORT,
    DEFAULT_HOST,
    defaultProxyConfig,
    loadProxyConfig,
    saveProxyConfig,
    status,
    probeHealth,
    start,
    stop,
    ensureRunning,
    autostartIfAllowed,
    isAutostartSuppressed,
  };
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_HOST,
  buildProxyStartArgs,
  buildProxyStopArgs,
  buildProxyStatusArgs,
  buildProxyHealthArgs,
  createClovapiProxy,
  createGoProxyManager: createClovapiProxy,
};

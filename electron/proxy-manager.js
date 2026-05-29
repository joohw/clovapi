const { spawn } = require("node:child_process");
const { readCoreExecutableVersion } = require("./clovapi-exec");
const clovapiDesktop = require("./clovapi-desktop");

const DEFAULT_PORT = 27483;
const DEFAULT_HOST = "127.0.0.1";

/** @typedef {{ host: string; port: number }} ProxyBindConfig */

/** @param {unknown} bindHost */
function normalizeBindHost(bindHost) {
  let raw = String(bindHost || "").trim();
  if (!raw) return DEFAULT_HOST;

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      raw = new URL(raw).hostname || DEFAULT_HOST;
    }
  } catch {
    raw = raw.replace(/^https?:\/\//i, "").split("/")[0] || DEFAULT_HOST;
  }

  if (raw.startsWith("[")) {
    const match = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (match) raw = match[1];
  } else if (!raw.includes("::")) {
    const colon = raw.indexOf(":");
    if (colon > 0 && /^\d+$/.test(raw.slice(colon + 1))) {
      raw = raw.slice(0, colon);
    }
  }

  const h = raw.toLowerCase();
  if (h === "0.0.0.0" || h === "::" || h === "::ffff:0.0.0.0") {
    return DEFAULT_HOST;
  }
  return raw || DEFAULT_HOST;
}

/** Host suitable for http://… health probes (brackets IPv6 literals). */
function healthClientHost(bindHost) {
  const host = normalizeBindHost(bindHost);
  const h = host.toLowerCase();
  if (h === "0.0.0.0" || h === "::" || h === "::ffff:0.0.0.0") {
    return DEFAULT_HOST;
  }
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }
  return host;
}

/** @param {unknown} bindHost @deprecated use normalizeBindHost */
function reachableLoopbackHost(bindHost) {
  return healthClientHost(bindHost);
}

/** @param {ProxyBindConfig} cfg */
function buildProxyStartArgs(cfg) {
  const host = normalizeBindHost(cfg?.host);
  const port = Number(cfg?.port) || DEFAULT_PORT;
  const args = ["proxy", "start", "--host", host, "--port", String(port)];
  return { host, port, args };
}

/** @param {ProxyBindConfig} cfg */
function buildProxyServeArgs(cfg) {
  return buildProxyStartArgs(cfg);
}

/** @param {ProxyBindConfig} cfg */
function buildProxyStopArgs(cfg) {
  const host = normalizeBindHost(cfg?.host);
  const port = Number(cfg?.port) || DEFAULT_PORT;
  const args = ["proxy", "stop", "--host", host, "--port", String(port)];
  return { host, port, args };
}

/** @param {ProxyBindConfig} cfg */
function healthUrl(cfg) {
  const { host, port } = buildProxyServeArgs(cfg);
  const clientHost = healthClientHost(host);
  const url = `http://${clientHost}:${port}/health`;
  // Fail fast with a clear error instead of fetch() rejecting opaque URL errors.
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new Error(`invalid proxy health URL: ${url}`);
  }
  return url;
}

/** @param {string | Buffer} text */
function redactSecrets(text) {
  let out = Buffer.isBuffer(text) ? text.toString("utf8") : String(text ?? "");
  out = out.replace(/Bearer\s+[\w-._~+/]+=*/gi, "Bearer [redacted]");
  out = out.replace(/(Bearer\s+)\S+/gi, "$1[redacted]");
  out = out.replace(/(sk-[a-z0-9]{10,})\b/gi, "[redacted]");
  out = out.replace(/(?:api-key|apikey|api_key|x-api-key)\s*[:=]\s*\S+/gi, (m) =>
    `${m.split(/[:=]/)[0]}: [redacted]`,
  );
  const max = 8192;
  if (out.length > max) {
    out = `${out.slice(0, max)} …[truncated]`;
  }
  return out.replace(/\r/g, "");
}

/** @type {(url: string) => Promise<{ ok: boolean; body?: unknown; error?: string }>} */
async function defaultFetchHealth(url) {
  const target = String(url || "").trim();
  if (!target) {
    return { ok: false, error: "proxy health URL is empty" };
  }
  try {
    // eslint-disable-next-line no-new
    new URL(target);
  } catch {
    return { ok: false, error: `invalid proxy health URL: ${target}` };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch(target, { signal: ac.signal });
    const raw = await res.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, error: `unexpected health body (${res.status})` };
    }
    const okHealth =
      res.ok &&
      Boolean(json?.ok === true && String(json?.service || "").includes("clovapi-core-proxy"));
    return okHealth ? { ok: true, body: json } : { ok: false, body: json, error: "health mismatch" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "health request failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve whether a PID's process command references the clovapi binary, so we
 * never kill an unrelated service that happens to share the proxy port.
 * @param {number} pid
 * @returns {Promise<boolean>}
 */
function processLooksLikeClovapi(pid) {
  return new Promise((resolve) => {
    const child = spawn("ps", ["-p", String(pid), "-o", "command="], { windowsHide: true });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(String(chunk || "")));
    child.on("error", () => resolve(false));
    child.on("close", () => {
      resolve(/clovapi/i.test(chunks.join("")));
    });
  });
}

/** @param {ProxyBindConfig} cfg @param {number} [skipPid] */
function releaseBindPort(cfg, skipPid = 0) {
  const port = Number(cfg?.port) || DEFAULT_PORT;
  const ignored = Number(skipPid) > 0 ? Number(skipPid) : 0;
  if (process.platform === "win32") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const child = spawn("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { windowsHide: true });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(String(chunk || "")));
    child.on("error", () => resolve(false));
    child.on("close", () => {
      const pids = chunks
        .join("")
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter((pid) => pid > 0 && pid !== ignored);
      if (!pids.length) {
        resolve(false);
        return;
      }
      // Only terminate processes that are actually a clovapi proxy. Other
      // services may legitimately bind the same port; killing them would cause
      // data loss or denial of service.
      Promise.all(pids.map((pid) => processLooksLikeClovapi(pid).then((ok) => (ok ? pid : 0))))
        .then((verified) => {
          const killable = verified.filter((pid) => pid > 0);
          if (!killable.length) {
            resolve(false);
            return;
          }
          for (const pid of killable) {
            try {
              process.kill(pid, "SIGTERM");
            } catch {
              /* noop */
            }
          }
          setTimeout(() => resolve(true), 280);
        })
        .catch(() => resolve(false));
    });
  });
}

/**
 * @typedef {object} ProxyManagerDeps
 * @property {() => Promise<string>} resolveExecutable Zero when missing.
 * @property {typeof spawn} [spawnFn]
 * @property {typeof defaultFetchHealth} [fetchHealth]
 * @property {number} [healthPollMs]
 * @property {number} [healthDeadlineMs]
 * @property {() => Promise<{ host: string; port: number; enabled?: boolean }>} [loadProxyConfigFn]
 */

/**
 * @param {ProxyManagerDeps} deps
 */
function createGoProxyManager(deps) {
  const resolveExecutable = deps.resolveExecutable;
  const spawnFn = deps.spawnFn || spawn;
  const fetchHealth = deps.fetchHealth || defaultFetchHealth;
  const healthPollMs = Number(deps.healthPollMs) > 0 ? Number(deps.healthPollMs) : 80;
  const healthDeadlineMs = Number(deps.healthDeadlineMs) > 0 ? Number(deps.healthDeadlineMs) : 15_000;

  /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
  let managedChild = null;
  let autostartSuppressed = false;
  let consecutiveStartFailures = 0;
  const maxAutostartAttempts = 3;

  /** @returns {Promise<ProxyBindConfig & { enabled?: boolean }>} */
  async function loadProxyConfigFromDisk() {
    const result = await clovapiDesktop.loadProxyConfig();
    if (!result?.ok) {
      throw new Error(String(result?.error || "failed to load proxy config"));
    }
    const cfg = result.proxy && typeof result.proxy === "object" ? result.proxy : {};
    return {
      enabled: cfg.enabled !== false,
      host: String(cfg.host || DEFAULT_HOST).trim() || DEFAULT_HOST,
      port: Number(cfg.port) || DEFAULT_PORT,
    };
  }

  /** @returns {Promise<ProxyBindConfig & { enabled?: boolean }>} */
  const resolveBindConfig = deps.loadProxyConfigFn || loadProxyConfigFromDisk;

  async function loadProxyConfig() {
    return resolveBindConfig();
  }

  function defaultProxyConfig() {
    return { enabled: true, host: DEFAULT_HOST, port: DEFAULT_PORT };
  }

  async function saveProxyConfig(patch) {
    const current = await loadProxyConfigFromDisk();
    const merged = { ...current, ...patch };
    const result = await clovapiDesktop.saveProxyConfig({
      enabled: merged.enabled !== false,
      host: String(merged.host || DEFAULT_HOST).trim() || DEFAULT_HOST,
      port: Number(merged.port) || DEFAULT_PORT,
    });
    if (!result?.ok) {
      throw new Error(String(result?.error || "failed to save proxy config"));
    }
    const cfg = result.proxy && typeof result.proxy === "object" ? result.proxy : merged;
    return {
      enabled: cfg.enabled !== false,
      host: String(cfg.host || DEFAULT_HOST).trim() || DEFAULT_HOST,
      port: Number(cfg.port) || DEFAULT_PORT,
    };
  }

  /** @param {ProxyBindConfig} cfg */
  function snapshotBaseUrls(cfg) {
    const bind = buildProxyServeArgs(cfg);
    const loop = healthClientHost(bind.host);
    return {
      host: bind.host,
      port: bind.port,
      baseUrl: `http://${loop}:${bind.port}`,
    };
  }

  /** @returns {boolean} */
  function ownsHealthyManagedPid() {
    return Boolean(managedChild && !managedChild.killed && managedChild.exitCode === null);
  }

  /** @returns {number | null} */
  function managedPidOrNull() {
    if (!ownsHealthyManagedPid() || managedChild?.pid == null) return null;
    return managedChild.pid;
  }

  /** @param {ProxyBindConfig} cfg */
  async function waitForHealthy(cfg) {
    const deadline = Date.now() + healthDeadlineMs;
    let lastErr = "timeout waiting for proxy /health";
    while (Date.now() < deadline) {
      const r = await fetchHealth(healthUrl(cfg));
      if (r.ok) {
        return true;
      }
      lastErr = String(r.error || "");
      await new Promise((res) => setTimeout(res, healthPollMs));
    }
    throw new Error(lastErr);
  }

  /** @param {string} exe @param {string[]} args @param {string} actionLabel */
  function launchProxyCli(exe, args, actionLabel) {
    return new Promise((resolve, reject) => {
      const child = spawnFn(exe, args, {
        env: process.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let errText = "";
      child.stderr?.on("data", (chunk) => {
        errText += String(chunk || "");
      });
      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            redactSecrets(errText.trim() || `proxy ${actionLabel} exited with code ${String(code)}`),
          ),
        );
      });
    });
  }

  /** @param {string} exe @param {ProxyBindConfig} cfg */
  function launchProxyDaemon(exe, cfg) {
    const { args } = buildProxyStartArgs(cfg);
    return launchProxyCli(exe, args, "start");
  }

  /** @param {string} exe @param {ProxyBindConfig} cfg */
  function launchProxyStop(exe, cfg) {
    const { args } = buildProxyStopArgs(cfg);
    return launchProxyCli(exe, args, "stop");
  }

  /** @param {ProxyBindConfig} cfg */
  async function stopProxyOnPort(cfg) {
    const exe = await resolveExecutable();
    if (!exe) {
      return false;
    }
    try {
      await launchProxyStop(exe, cfg);
      return true;
    } catch {
      return false;
    }
  }

  /** @param {string} exe @param {string[]} args */
  function spawnManaged(cfg, exe) {
    const { args } = buildProxyServeArgs(cfg);
    const child = spawnFn(exe, args, {
      env: process.env,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.on("close", () => {
      if (managedChild === child) {
        managedChild = null;
      }
    });

    return child;
  }

  /**
   * @param {ProxyBindConfig} cfg
   * @returns {Promise<{
   *   running: boolean;
   *   managed: boolean;
   *   pid: number | null;
   *   port: number;
   *   host: string;
   *   baseUrl: string;
   *   error: string;
   * }>}
   */
  async function status() {
    const cfg = await loadProxyConfig();
    const urls = snapshotBaseUrls(cfg);
    const hc = await fetchHealth(healthUrl(cfg));
    const owns = ownsHealthyManagedPid();
    return {
      running: hc.ok === true,
      managed: Boolean(hc.ok && owns),
      pid: hc.ok ? managedPidOrNull() : null,
      port: urls.port,
      host: urls.host,
      baseUrl: urls.baseUrl,
      error: hc.ok ? "" : String(hc.error || "health failed"),
    };
  }

  async function probeHealth() {
    const cfg = await loadProxyConfig();
    const url = healthUrl(cfg);
    const started = Date.now();
    const hc = await fetchHealth(url);
    return {
      ok: true,
      passed: hc.ok === true,
      url,
      latencyMs: Date.now() - started,
      body: hc.body ?? null,
      error: hc.ok ? "" : String(hc.error || "health failed"),
    };
  }

  /** @returns {Promise<void>} */
  function killManagedSubtree(pid) {
    return new Promise((resolve) => {
      if (!pid) {
        resolve();
        return;
      }
      if (process.platform === "win32") {
        const tk = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
        tk.on("close", () => resolve());
        tk.on("error", () => resolve());
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* noop */
        }
        setTimeout(resolve, 380);
      }
    });
  }

  /** @returns {Promise<void>} */
  async function stopManaged(reason) {
    const child = managedChild;
    if (!child?.pid || child.exitCode !== null || child.killed) {
      managedChild = null;
      return;
    }
    const pid = child.pid;
    managedChild = null;
    await killManagedSubtree(pid);
  }

  /** @param {ProxyBindConfig} cfg @param {string} [_reason] */
  async function replaceStaleExternalProxy(cfg, _reason) {
    await stopProxyOnPort(cfg);
    await releaseBindPort(cfg, managedPidOrNull() ?? 0);
    await new Promise((resolve) => setTimeout(resolve, 280));
  }

  /** @param {ProxyBindConfig} cfg @param {{ ok?: boolean; body?: unknown }} healthProbe @param {boolean} ownedAlive */
  async function maybeReplaceStaleDevProxy(cfg, healthProbe, ownedAlive) {
    if (process.env.ELECTRON_DEV !== "1" || !healthProbe?.ok || ownedAlive) {
      return healthProbe;
    }
    const runningVersion = String(healthProbe.body?.version || "").trim();
    if (!runningVersion) {
      return healthProbe;
    }
    const exe = await resolveExecutable();
    const targetVersion = readCoreExecutableVersion(exe);
    if (!targetVersion || runningVersion === targetVersion) {
      return healthProbe;
    }
    await replaceStaleExternalProxy(cfg, `replacing stale dev proxy version ${runningVersion} -> ${targetVersion}`);
    return fetchHealth(healthUrl(cfg));
  }

  /**
   * @param {{ port?: number; host?: string }} [options]
   */
  async function start(options = {}) {
    autostartSuppressed = false;
    consecutiveStartFailures = 0;
    const cfg = await loadProxyConfig();
    const merged = {
      ...cfg,
      ...(Number(options.port) > 0 ? { port: Number(options.port) } : {}),
      ...(String(options.host || "").trim()
        ? { host: String(options.host || "").trim() }
        : {}),
    };
    const urls = snapshotBaseUrls(merged);
    let hProbe = await fetchHealth(healthUrl(merged));
    hProbe = await maybeReplaceStaleDevProxy(merged, hProbe, false);

    const exe = await resolveExecutable();
    if (!exe) {
      const again = await fetchHealth(healthUrl(merged));
      return {
        ok: false,
        running: Boolean(again.ok),
        managed: false,
        pid: null,
        port: urls.port,
        host: urls.host,
        baseUrl: urls.baseUrl,
        error: "clovapi executable not found (bundle or PATH)",
      };
    }

    try {
      await launchProxyDaemon(exe, merged);
    } catch (e) {
      consecutiveStartFailures += 1;
      const errMsg = e instanceof Error ? e.message : String(e);
      const hc = await fetchHealth(healthUrl(merged));
      return {
        ok: false,
        running: Boolean(hc.ok),
        managed: false,
        pid: null,
        port: urls.port,
        host: urls.host,
        baseUrl: urls.baseUrl,
        error: redactSecrets(errMsg),
        autostartBlocked: consecutiveStartFailures >= maxAutostartAttempts,
      };
    }

    const hc = await fetchHealth(healthUrl(merged));
    return {
      ok: hc.ok === true,
      alreadyRunning: Boolean(hProbe.ok),
      running: hc.ok === true,
      managed: false,
      pid: null,
      external: hc.ok === true,
      port: urls.port,
      host: urls.host,
      baseUrl: urls.baseUrl,
      error: hc.ok ? "" : String(hc.error || "proxy health check failed after start"),
    };
  }

  /**
   * @param {{ suppressAutostart?: boolean }} [options]
   */
  async function stop(options = {}) {
    const suppressAutostart = options.suppressAutostart !== false;
    if (suppressAutostart) {
      autostartSuppressed = true;
    }
    consecutiveStartFailures = 0;
    const hadManagedChild = ownsHealthyManagedPid();
    await stopManaged("user-stop");
    const cfg = await loadProxyConfig();
    await stopProxyOnPort(cfg);
    const urls = snapshotBaseUrls(cfg);
    const hcAfter = await fetchHealth(healthUrl(cfg));
    return {
      ok: true,
      running: hcAfter.ok === true,
      managed: false,
      killedManaged: hadManagedChild,
      autostartSuppressed: suppressAutostart,
      port: urls.port,
      host: urls.host,
      baseUrl: urls.baseUrl,
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
      return {
        ok: false,
        running: false,
        skipped: true,
        reason: "start-failures-capped",
      };
    }
    const cfg = await loadProxyConfig();
    if (cfg.enabled === false) {
      return { ok: true, running: false, skipped: true, reason: "proxy-disabled" };
    }
    return start(payload);
  }

  async function ensureRunning(payload = {}) {
    const started = await start(payload);
    if (!started.ok) {
      return started;
    }
    return {
      ok: true,
      running: Boolean(started.running),
      managed: Boolean(started.managed),
      pid: started.pid ?? null,
      port: started.port,
      host: started.host,
      baseUrl: started.baseUrl,
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
    healthUrlForConfig: (c) => healthUrl(c),
  };
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_HOST,
  buildProxyServeArgs,
  buildProxyStopArgs,
  normalizeBindHost,
  reachableLoopbackHost,
  healthClientHost,
  healthUrl,
  redactSecrets,
  createGoProxyManager,
};

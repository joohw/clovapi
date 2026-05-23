const { spawn } = require("node:child_process");
const profileStore = require("./profile-store");
const proxyLogger = require("./proxy-logger");

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
function buildProxyServeArgs(cfg) {
  const host = normalizeBindHost(cfg?.host);
  const port = Number(cfg?.port) || DEFAULT_PORT;
  const args = ["proxy", "serve", "--host", host, "--port", String(port)];
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

/** @param {ProxyBindConfig} cfg */
function callLogUrl(cfg) {
  const { host, port } = buildProxyServeArgs(cfg);
  const clientHost = healthClientHost(host);
  return `http://${clientHost}:${port}/__debug/call-log`;
}

/** @type {(url: string) => Promise<{ ok: boolean; supports: boolean; error?: string }>} */
async function defaultFetchCallLogSupport(url) {
  const target = String(url || "").trim();
  if (!target) {
    return { ok: false, supports: false, error: "call-log URL is empty" };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch(target, { signal: ac.signal });
    if (!res.ok) {
      return { ok: false, supports: false, error: `call-log status ${res.status}` };
    }
    const json = await res.json();
    return { ok: true, supports: Array.isArray(json?.entries) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "call-log request failed";
    return { ok: false, supports: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
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
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* noop */
        }
      }
      setTimeout(() => resolve(true), 280);
    });
  });
}

/**
 * @typedef {object} ProxyManagerDeps
 * @property {() => Promise<string>} resolveExecutable Zero when missing.
 * @property {typeof spawn} [spawnFn]
 * @property {typeof defaultFetchHealth} [fetchHealth]
 * @property {typeof defaultFetchCallLogSupport} [fetchCallLogSupport]
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
  const fetchCallLogSupport = deps.fetchCallLogSupport || defaultFetchCallLogSupport;
  const healthPollMs = Number(deps.healthPollMs) > 0 ? Number(deps.healthPollMs) : 80;
  const healthDeadlineMs = Number(deps.healthDeadlineMs) > 0 ? Number(deps.healthDeadlineMs) : 15_000;

  /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
  let managedChild = null;

  /** @returns {Promise<ProxyBindConfig & { enabled?: boolean }>} */
  async function loadProxyConfigFromDisk() {
    const store = await profileStore.loadStore();
    const cfg = store.proxy && typeof store.proxy === "object" ? store.proxy : {};
    return {
      enabled: true,
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
    const store = await profileStore.loadStore();
    const current = await loadProxyConfigFromDisk();
    store.proxy = { ...current, ...patch };
    await profileStore.saveStore(store);
    return store.proxy;
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

  /** @param {string} exe @param {string[]} args */
  function attachChildLogs(child) {
    const onChunk = (/** @type {"stdout"|"stderr"} */ stream) => (/** @type {Buffer|string} */ chunk) => {
      proxyLogger.pushProcChunks(stream, redactSecrets(chunk));
    };
    child.stdout?.on?.("data", onChunk("stdout"));
    child.stderr?.on?.("data", onChunk("stderr"));
  }

  /** @param {ProxyBindConfig} cfg @param {string} exe */
  function spawnManaged(cfg, exe) {
    const { args } = buildProxyServeArgs(cfg);
    const child = spawnFn(exe, args, {
      env: process.env,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    attachChildLogs(child);

    child.on("error", (err) => {
      proxyLogger.pushSystemLine("stderr", `[spawn] ${redactSecrets(err.message || String(err))}`);
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
    proxyLogger.pushSystemLine("stderr", `[proxy-manager] stopping core (${reason || "shutdown"}, pid=${String(pid)})`);
    await killManagedSubtree(pid);
  }

  /** @param {ProxyBindConfig} cfg */
  async function proxySupportsCallLog(cfg) {
    const result = await fetchCallLogSupport(callLogUrl(cfg));
    return Boolean(result.supports);
  }

  /** @param {ProxyBindConfig} cfg @param {{ host: string; port: number; baseUrl: string }} urls */
  async function acceptExternalProxy(cfg, urls) {
    if (!(await proxySupportsCallLog(cfg))) {
      return null;
    }
    return {
      ok: true,
      alreadyRunning: true,
      running: true,
      managed: false,
      pid: null,
      external: true,
      port: urls.port,
      host: urls.host,
      baseUrl: urls.baseUrl,
    };
  }

  /** @param {ProxyBindConfig} cfg @param {string} reason */
  async function replaceStaleExternalProxy(cfg, reason) {
    proxyLogger.pushSystemLine(
      "system",
      `[proxy-manager] ${reason} (port ${Number(cfg?.port) || DEFAULT_PORT})`,
    );
    await releaseBindPort(cfg, managedPidOrNull() ?? 0);
    await new Promise((resolve) => setTimeout(resolve, 280));
  }

  /**
   * @param {{ port?: number; host?: string }} [options]
   */
  async function start(options = {}) {
    const cfg = await loadProxyConfig();
    const merged = {
      ...cfg,
      ...(Number(options.port) > 0 ? { port: Number(options.port) } : {}),
      ...(String(options.host || "").trim()
        ? { host: String(options.host || "").trim() }
        : {}),
    };
    const urls = snapshotBaseUrls(merged);
    const hProbe = await fetchHealth(healthUrl(merged));
    const ownedAlive = ownsHealthyManagedPid();

    if (hProbe.ok && !ownedAlive) {
      const external = await acceptExternalProxy(merged, urls);
      if (external) return external;
      await replaceStaleExternalProxy(
        merged,
        "replacing stale external proxy without call-log support",
      );
    }

    if (hProbe.ok && ownedAlive && managedPidOrNull() != null) {
      if (await proxySupportsCallLog(merged)) {
        return {
          ok: true,
          alreadyRunning: true,
          running: true,
          managed: true,
          pid: managedPidOrNull(),
          port: urls.port,
          host: urls.host,
          baseUrl: urls.baseUrl,
        };
      }
      await stopManaged("managed-proxy-without-call-log-support");
      await new Promise((r) => setTimeout(r, 140));
    }

    if (ownedAlive && !hProbe.ok) {
      try {
        await waitForHealthy(merged);
        return {
          ok: true,
          alreadyRunning: true,
          running: true,
          managed: true,
          pid: managedPidOrNull(),
          port: urls.port,
          host: urls.host,
          baseUrl: urls.baseUrl,
        };
      } catch {
        await stopManaged("unhealthy-managed-child");
        await new Promise((r) => setTimeout(r, 140));
      }
    }

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

    const child = spawnManaged(merged, exe);
    managedChild = child;

    try {
      await waitForHealthy(merged);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const hc = await fetchHealth(healthUrl(merged));

      const stillUs = Boolean(managedChild && managedChild === child);
      const ourPid = child.pid;
      const oursAlive =
        Boolean(
          stillUs &&
            managedChild &&
            managedChild.pid === ourPid &&
            !managedChild.killed &&
            managedChild.exitCode === null,
        );

      if (hc.ok === true && !oursAlive) {
        await stopManaged("bind-race-or-external");
        const external = await acceptExternalProxy(merged, urls);
        if (external) return external;
        await replaceStaleExternalProxy(
          merged,
          "replacing stale external proxy after bind race",
        );
      }

      if (hc.ok === true && oursAlive) {
        return {
          ok: true,
          alreadyRunning: false,
          running: true,
          managed: true,
          pid: ourPid ?? null,
          port: urls.port,
          host: urls.host,
          baseUrl: urls.baseUrl,
        };
      }

      await stopManaged("startup-failed");

      const post = await fetchHealth(healthUrl(merged));
      if (post.ok) {
        const external = await acceptExternalProxy(merged, urls);
        if (external) return external;
        await replaceStaleExternalProxy(
          merged,
          "replacing stale external proxy after startup failure",
        );
      }

      return {
        ok: false,
        running: false,
        managed: false,
        pid: null,
        port: urls.port,
        host: urls.host,
        baseUrl: urls.baseUrl,
        error: redactSecrets(errMsg),
      };
    }

    return {
      ok: true,
      alreadyRunning: false,
      running: true,
      managed: true,
      pid: managedChild?.pid ?? null,
      port: urls.port,
      host: urls.host,
      baseUrl: urls.baseUrl,
    };
  }

  async function stop() {
    const hadManagedChild = ownsHealthyManagedPid();
    await stopManaged("user-stop");
    const cfg = await loadProxyConfig();
    const urls = snapshotBaseUrls(cfg);
    const hcAfter = await fetchHealth(healthUrl(cfg));
    return {
      ok: true,
      running: hcAfter.ok === true,
      managed: false,
      killedManaged: hadManagedChild,
      port: urls.port,
      host: urls.host,
      baseUrl: urls.baseUrl,
    };
  }

  async function ensureRunning(payload = {}) {
    const base = await loadProxyConfig();
    const mergedCfg = {
      ...base,
      ...(Number(payload.port) > 0 ? { port: Number(payload.port) } : {}),
    };
    const urls = snapshotBaseUrls(mergedCfg);
    const hi = await fetchHealth(healthUrl(mergedCfg));
    if (hi.ok === true) {
      const owns = ownsHealthyManagedPid();
      if (await proxySupportsCallLog(mergedCfg)) {
        return {
          ok: true,
          running: true,
          managed: Boolean(owns),
          pid: managedPidOrNull(),
          port: urls.port,
          host: urls.host,
          baseUrl: urls.baseUrl,
        };
      }
      if (owns) {
        await stopManaged("managed-proxy-without-call-log-support");
        await new Promise((resolve) => setTimeout(resolve, 140));
      } else {
        await replaceStaleExternalProxy(
          mergedCfg,
          "replacing stale external proxy without call-log support",
        );
      }
    }
    const started = await start(payload);
    if (!started.ok) {
      return started;
    }
    return {
      ok: true,
      running: Boolean(started.running),
      managed: Boolean(started.managed),
      pid: started.pid ?? null,
      port: started.port ?? urls.port,
      host: started.host ?? urls.host,
      baseUrl: started.baseUrl ?? urls.baseUrl,
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
    healthUrlForConfig: (c) => healthUrl(c),
  };
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_HOST,
  buildProxyServeArgs,
  normalizeBindHost,
  healthClientHost,
  reachableLoopbackHost,
  healthUrl,
  callLogUrl,
  redactSecrets,
  createGoProxyManager,
};

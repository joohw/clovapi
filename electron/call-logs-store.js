const { logsDir, callLogsDBPath } = require("./config-paths");
const { runClovapiArgsAsync } = require("./clovapi-exec");

const DEFAULT_CALL_LOG_PAGE_SIZE = 20;
const DEFAULT_PROXY_HOST = "127.0.0.1";
const DEFAULT_PROXY_PORT = 27483;
const DEFAULT_DEBUG_TIMEOUT_MS = 2500;

function normalizePage(input = {}) {
  const limit = Math.max(1, Number(input.limit) || DEFAULT_CALL_LOG_PAGE_SIZE);
  const offset = Math.max(0, Number(input.offset) || 0);
  return { limit, offset };
}

async function readCallLogsViaCLI(options = {}) {
  const { limit, offset } = normalizePage(options);
  const result = await runClovapiArgsAsync(
    ["proxy", "logs", "list", "--json", "--limit", String(limit + 1), "--offset", String(offset)],
    { timeout: 8000 },
  );
  if (!result.ok) return { entries: [], limit, offset, hasMore: false };
  const raw = String(result.stdout || "").trim();
  if (!raw) return { entries: [], limit, offset, hasMore: false };
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [];
    const hasMore = rows.length > limit;
    return { entries: hasMore ? rows.slice(0, limit) : rows, limit, offset, hasMore };
  } catch {
    return { entries: [], limit, offset, hasMore: false };
  }
}

async function readCallLogs(options = {}) {
  return readCallLogsViaCLI(options);
}

async function clearCallLogsFile() {
  await runClovapiArgsAsync(["proxy", "logs", "clear", "--yes"], { timeout: 8000 });
}

function normalizeProxyHost(host) {
  const raw = String(host || "").trim() || DEFAULT_PROXY_HOST;
  const lower = raw.toLowerCase();
  if (lower === "0.0.0.0" || lower === "::" || lower === "::ffff:0.0.0.0") {
    return DEFAULT_PROXY_HOST;
  }
  return raw;
}

function normalizeProxyPort(port) {
  const value = Number(port);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROXY_PORT;
}

function proxyOrigin(host, port) {
  const normalizedHost = normalizeProxyHost(host);
  const needsBrackets = normalizedHost.includes(":") && !normalizedHost.startsWith("[");
  const urlHost = needsBrackets ? `[${normalizedHost}]` : normalizedHost;
  return `http://${urlHost}:${normalizeProxyPort(port)}`;
}

async function fetchProxyDebugJSON(pathname, query = {}, options = {}) {
  const cfg = options.proxy;
  if (!cfg || typeof cfg !== "object") {
    throw new Error("proxy config is required for debug log HTTP requests");
  }
  const url = new URL(pathname, proxyOrigin(cfg.host, cfg.port));
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_DEBUG_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`proxy debug request failed: HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function readCallLogsViaHTTP(options = {}) {
  const { limit, offset } = normalizePage(options);
  const parsed = await fetchProxyDebugJSON("/__debug/call-log", {
    limit,
    offset,
    api_key: options.apiKey,
    api_key_unidentified: options.apiKeyUnidentified ? "1" : "",
  }, { proxy: options.proxy });
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const apiKeyAggregates = Array.isArray(parsed?.apiKeyAggregates) ? parsed.apiKeyAggregates : [];
  return {
    entries,
    apiKeyAggregates,
    limit: Number(parsed?.limit) || limit,
    offset: Number(parsed?.offset) || offset,
    hasMore: Boolean(parsed?.hasMore),
  };
}

async function readSystemLogsViaCLI(limit = 20) {
  const args = ["proxy", "syslogs", "list", "--json"];
  if (limit > 0) args.push("--limit", String(limit));
  const result = await runClovapiArgsAsync(args, { timeout: 10000 });
  if (!result.ok) return [];
  const raw = String(result.stdout || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readSystemLogsViaHTTP(limit = 20, options = {}) {
  const parsed = await fetchProxyDebugJSON("/__debug/system-log", {
    limit: Math.max(1, Number(limit) || 20),
  }, { proxy: options.proxy });
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
}

async function readUsageViaHTTP(options = {}) {
  const parsed = await fetchProxyDebugJSON(
    "/__debug/usage",
    { refresh: options.refresh ? "1" : "" },
    { proxy: options.proxy, timeout: options.timeout ?? 30000 },
  );
  return {
    ok: parsed?.ok !== false,
    usages: Array.isArray(parsed?.usages) ? parsed.usages : [],
    updatedAt: String(parsed?.updatedAt || ""),
    polling: Boolean(parsed?.polling),
    error: String(parsed?.error || ""),
  };
}

async function readProfilesViaHTTP(options = {}) {
  return fetchProxyDebugJSON("/__debug/profiles", {}, {
    proxy: options.proxy,
    timeout: options.timeout ?? 10000,
  });
}

async function clearSystemLogsViaCLI() {
  await runClovapiArgsAsync(["proxy", "syslogs", "clear", "--yes"], { timeout: 10000 });
}

async function clearProxyDebugLogs(scope = "all", options = {}) {
  const normalized = String(scope || "all").trim().toLowerCase();
  if (normalized === "system" || normalized === "all") {
    await fetchProxyDebugJSON("/__debug/system-log", {}, { method: "DELETE", proxy: options.proxy });
  }
  if (normalized === "calls" || normalized === "all") {
    await fetchProxyDebugJSON("/__debug/call-log", {}, { method: "DELETE", proxy: options.proxy });
  }
}

module.exports = {
  logsDir,
  callLogsDBPath,
  callLogsPath: callLogsDBPath,
  DEFAULT_CALL_LOG_PAGE_SIZE,
  readCallLogs,
  clearCallLogsFile,
  readCallLogsViaHTTP,
  readSystemLogsViaCLI,
  readSystemLogsViaHTTP,
  readUsageViaHTTP,
  readProfilesViaHTTP,
  clearSystemLogsViaCLI,
  clearProxyDebugLogs,
};

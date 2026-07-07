import { isElectronDev } from "../constants";
import { t } from "../i18n";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { ProxyLogAPIKeyAggregate, ProxyLogEntry } from "../../global";

type UpdateDetail = {
  current_version?: string;
  latest_version?: string;
  target_path?: string;
  updated?: boolean;
  up_to_date?: boolean;
};

type CoreUpdateOptions = {
  silent?: boolean;
};

const DEFAULT_BIND_HOST = "0.0.0.0";
const DEFAULT_CLIENT_HOST = "127.0.0.1";
const DEFAULT_PROXY_PORT = 27483;

function clientHost(host: string): string {
  const value = String(host || "").trim();
  if (!value || value === "0.0.0.0" || value === "::" || value === "::ffff:0.0.0.0") {
    return DEFAULT_CLIENT_HOST;
  }
  return value;
}

function proxyBaseUrl(host: string, port: number): string {
  return `http://${clientHost(host)}:${Number(port) > 0 ? Number(port) : DEFAULT_PROXY_PORT}`;
}

function applyProxyConfig(config: { host?: string; port?: number } | undefined) {
  const host = String(config?.host || "").trim() || DEFAULT_BIND_HOST;
  const port = Number(config?.port) || DEFAULT_PROXY_PORT;
  store.proxyHost = host;
  store.proxyPort = port;
  store.proxyBaseUrl = proxyBaseUrl(host, port);
  store.proxyAddressDraft = store.proxyBaseUrl;
}

function parseProxyAddress(value: string): { host: string; port: number } {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(t("proxy.localAddressRequired"));
  const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
  const host = url.hostname.trim();
  const port = Number(url.port || DEFAULT_PROXY_PORT);
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(t("proxy.localAddressInvalid"));
  }
  return { host, port };
}

function applyCoreUpdateCheckDetail(detail: UpdateDetail, silent: boolean) {
  if (detail.up_to_date) {
    store.coreUpdateAvailable = false;
    store.coreLatestVersion = "";
    if (!silent) {
      store.coreUpdateCheck = {
        status: "pass",
        summary: t("proxy.updateUpToDate"),
        detail: "",
        testedAt: Date.now(),
      };
    }
    return;
  }

  store.coreUpdateAvailable = true;
  store.coreLatestVersion = detail.latest_version || "";
  if (!silent) {
    store.coreUpdateCheck = {
      status: "pass",
      summary: t("proxy.updateAvailable", { latest: detail.latest_version || "?" }),
      detail: "",
      testedAt: Date.now(),
    };
  }
}

function parseVersionFromHealthBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const version = (body as { version?: unknown }).version;
  return typeof version === "string" ? version.trim() : "";
}

function fallbackAPIKeyAggregatesFromRequests(requests: ProxyLogEntry[]): ProxyLogAPIKeyAggregate[] {
  const rows = new Map<string, ProxyLogAPIKeyAggregate>();
  for (const entry of requests) {
    const fingerprint = String(entry.apiKey?.fingerprint || "").trim();
    const key = fingerprint || "__unidentified__";
    let row = rows.get(key);
    if (!row) {
      row = {
        apiKey: fingerprint ? entry.apiKey : undefined,
        count: 0,
        unidentified: !fingerprint,
        lastStartedAt: entry.startedAt || "",
      };
      rows.set(key, row);
    }
    row.count += 1;
    row.inputTokens = (row.inputTokens || 0) + (entry.tokenUsage?.inputTokens || 0);
    row.outputTokens = (row.outputTokens || 0) + (entry.tokenUsage?.outputTokens || 0);
    row.totalTokens = (row.totalTokens || 0) + (entry.tokenUsage?.totalTokens || 0);
    row.toolCallCount = (row.toolCallCount || 0) + (entry.toolCallCount || 0);
    if (entry.error || (entry.upstream?.status || 0) >= 400) {
      row.errorCount = (row.errorCount || 0) + 1;
    }
    if (entry.startedAt && (!row.lastStartedAt || entry.startedAt > row.lastStartedAt)) {
      row.lastStartedAt = entry.startedAt;
    }
  }
  return [...rows.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(b.lastStartedAt || "").localeCompare(String(a.lastStartedAt || ""));
  });
}

async function resolveCoreVersionFromCli(): Promise<string> {
  const bridge = window.clovapiCli;
  if (!bridge?.runClovapi) return "";
  const result = await bridge.runClovapi(["version"], "");
  if (!result?.ok) return "";
  const line = String(result.stdout || "")
    .trim()
    .split("\n")[0];
  const match = line.match(/^clovapi\s+(\S+)/);
  return match?.[1]?.trim() || "";
}

export async function refreshCoreVersion() {
  if (store.proxyRunning) {
    const bridge = window.clovapiCli;
    if (bridge?.proxyHealth) {
      try {
        const result = await bridge.proxyHealth();
        const version = parseVersionFromHealthBody(result?.body);
        if (version) {
          store.coreVersion = version;
          return;
        }
      } catch {
        /* fall through to CLI */
      }
    }
  }
  store.coreVersion = await resolveCoreVersionFromCli();
}

export async function refreshProxyStatus() {
  const bridge = window.clovapiCli;
  if (!bridge?.proxyStatus) return;
  try {
    const result = await bridge.proxyStatus();
    if (result?.ok) {
      store.proxyRunning = Boolean(result.running);
      applyProxyConfig({
        host: String(result.config?.host || result.host || store.proxyHost),
        port: Number(result.config?.port || result.port || store.proxyPort),
      });
      if (result.baseUrl) {
        store.proxyBaseUrl = result.baseUrl;
        store.proxyAddressDraft = result.baseUrl;
      }
    }
  } catch {
    store.proxyRunning = false;
  }
  await refreshCoreVersion();
}

export async function refreshProxyLogs(offset = store.proxyLogsOffset) {
  const bridge = window.clovapiCli;
  if (!bridge?.proxyLogsList || store.proxyLogsLoading) return;
  store.proxyLogsLoading = true;
  try {
    const pageSize = Number(store.proxyLogsPageSize) || 20;
    const nextOffset = Math.max(0, Number(offset) || 0);
    const result = await bridge.proxyLogsList({
      limit: pageSize,
      offset: nextOffset,
      apiKey: store.proxyLogSelectedApiKeyFingerprint || undefined,
      apiKeyUnidentified: store.proxyLogSelectedApiKeyUnidentified || undefined,
    });
    if (result?.ok) {
      const requests = Array.isArray(result.requests) ? result.requests : [];
      if (Array.isArray(result.requests)) {
        store.proxyLogs = requests;
      }
      if (Array.isArray(result.apiKeyAggregates) && result.apiKeyAggregates.length) {
        store.proxyLogApiKeyAggregates = result.apiKeyAggregates;
      } else if (!store.proxyLogSelectedApiKeyFingerprint && !store.proxyLogSelectedApiKeyUnidentified) {
        store.proxyLogApiKeyAggregates = fallbackAPIKeyAggregatesFromRequests(requests);
      }
      store.proxyLogsOffset = Number(result.callLogPage?.offset) || nextOffset;
      store.proxyLogsPageSize = Number(result.callLogPage?.limit) || pageSize;
      store.proxyLogsHasMore = Boolean(result.callLogPage?.hasMore);
      if (Array.isArray(result.system)) {
        store.proxySystemLogs = result.system;
      }
    }
  } finally {
    store.proxyLogsLoading = false;
  }
}

export async function nextProxyLogsPage() {
  if (!store.proxyLogsHasMore || store.proxyLogsLoading) return;
  await refreshProxyLogs(store.proxyLogsOffset + store.proxyLogsPageSize);
}

export async function previousProxyLogsPage() {
  if (store.proxyLogsLoading || store.proxyLogsOffset <= 0) return;
  await refreshProxyLogs(Math.max(0, store.proxyLogsOffset - store.proxyLogsPageSize));
}

export async function clearCallLogs() {
  const bridge = window.clovapiCli;
  if (!bridge?.proxyLogsClear) return;
  const result = await bridge.proxyLogsClear("calls");
  if (!result?.ok) {
    toast.error(result?.error || t("toast.proxyClearCallLogsFailed"));
    return;
  }
  store.proxyLogs = [];
  store.proxyLogApiKeyAggregates = [];
  store.proxyLogsOffset = 0;
  store.proxyLogsHasMore = false;
  store.proxyLogSelectedApiKeyFingerprint = null;
  store.proxyLogSelectedApiKeyUnidentified = false;
  store.proxyLogSelectedApiKeyLabel = "";
  store.proxyLogSelectedId = null;
}

export async function clearSystemLogs() {
  const bridge = window.clovapiCli;
  if (!bridge?.proxyLogsClear) return;
  const result = await bridge.proxyLogsClear("system");
  if (!result?.ok) {
    toast.error(result?.error || t("toast.proxyClearSystemLogsFailed"));
    return;
  }
  store.proxySystemLogs = [];
  store.proxySystemLogSelectedId = null;
}

export async function runProxyHealthTest() {
  if (store.proxyHealthTest?.status === "testing") return;

  const bridge = window.clovapiCli;
  if (!bridge?.proxyHealth) {
    toast.error(t("toast.proxyHealthUnsupported"));
    return;
  }

  store.proxyHealthTest = {
    status: "testing",
    summary: t("common.testing"),
    detail: "",
  };

  try {
    const result = await bridge.proxyHealth();
    await refreshProxyStatus();

    const version = parseVersionFromHealthBody(result?.body);
    if (version) store.coreVersion = version;

    if (result?.ok && result.passed) {
      const latency = result.latencyMs != null ? `${result.latencyMs}ms` : "";
      store.proxyHealthTest = {
        status: "pass",
        summary: latency ? `Health OK · ${latency}` : "Health OK",
        detail: "",
      };
      return;
    }

    const reason = result?.error || t("toast.proxyNotRunning");
    store.proxyHealthTest = {
      status: "fail",
      summary: `Health failed · ${reason}`,
      detail: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.proxyHealthFailed");
    store.proxyHealthTest = {
      status: "fail",
      summary: `${t("modelTest.failed")} · ${message}`,
      detail: "",
    };
  }
}

export async function checkCoreUpdate(options: CoreUpdateOptions = {}) {
  const silent = options.silent === true;
  if (isElectronDev()) return false;
  if (store.coreUpdating) return false;
  if (!silent && store.coreUpdateCheck?.status === "testing") return false;

  const bridge = window.clovapiCli;
  if (!bridge?.updateCli) {
    if (!silent) {
      toast.error(t("toast.coreUpdateUnsupported"));
    }
    return false;
  }

  if (!silent) {
    store.coreUpdateCheck = {
      status: "testing",
      summary: t("common.testing"),
      detail: "",
    };
  }

  try {
    const result = await bridge.updateCli({ check: true });
    const detail = (result?.detail || {}) as UpdateDetail;

    if (detail.current_version) {
      store.coreVersion = detail.current_version;
    } else if (!store.coreVersion) {
      await refreshCoreVersion();
    }

    if (!result?.ok) {
      store.coreUpdateAvailable = false;
      store.coreLatestVersion = "";
      if (!silent) {
        store.coreUpdateCheck = {
          status: "fail",
          summary: result?.error || t("toast.coreUpdateCheckFailed"),
          detail: "",
        };
      }
      return false;
    }

    applyCoreUpdateCheckDetail(detail, silent);
    return store.coreUpdateAvailable;
  } catch (error) {
    store.coreUpdateAvailable = false;
    store.coreLatestVersion = "";
    if (!silent) {
      store.coreUpdateCheck = {
        status: "fail",
        summary: error instanceof Error ? error.message : t("toast.coreUpdateCheckFailed"),
        detail: "",
      };
    }
    return false;
  }
}

export async function installCoreUpdate(options: CoreUpdateOptions = {}) {
  const silent = options.silent === true;
  if (isElectronDev()) return false;
  if (store.coreUpdating) return false;
  if (!silent && store.coreUpdateCheck?.status === "testing") return false;

  const bridge = window.clovapiCli;
  if (!bridge?.updateCli) {
    if (!silent) {
      toast.error(t("toast.coreUpdateUnsupported"));
    }
    return false;
  }

  store.coreUpdating = true;
  if (!silent) {
    store.coreUpdateCheck = {
      status: "testing",
      summary: t("proxy.updating"),
      detail: "",
    };
  }

  try {
    const result = await bridge.updateCli({});
    const detail = (result?.detail || {}) as UpdateDetail;

    if (!result?.ok) {
      store.coreUpdateCheck = {
        status: "fail",
        summary: result?.error || t("toast.coreUpdateInstallFailed"),
        detail: "",
      };
      toast.error(result?.error || t("toast.coreUpdateInstallFailed"));
      return false;
    }

    if (detail.latest_version) {
      store.coreVersion = detail.latest_version;
    } else if (detail.current_version) {
      store.coreVersion = detail.current_version;
    }

    store.coreUpdateAvailable = false;
    store.coreLatestVersion = "";

    if (detail.updated) {
      store.coreUpdateCheck = {
        status: "pass",
        summary: t("proxy.updateInstalled", { version: detail.latest_version || store.coreVersion }),
        detail: "",
        testedAt: Date.now(),
      };
      toast.success(t("toast.coreUpdateInstalled"));
      await restartLocalProxy();
      await refreshCoreVersion();
      return true;
    }

    store.coreUpdateCheck = {
      status: "pass",
      summary: t("proxy.updateUpToDate"),
      detail: "",
      testedAt: Date.now(),
    };
    return false;
  } catch (error) {
    store.coreUpdateCheck = {
      status: "fail",
      summary: error instanceof Error ? error.message : t("toast.coreUpdateInstallFailed"),
      detail: "",
    };
    toast.error(error instanceof Error ? error.message : t("toast.coreUpdateInstallFailed"));
    return false;
  } finally {
    store.coreUpdating = false;
  }
}

export async function autoUpdateCoreOnStartup() {
  if (isElectronDev()) return;
  const updateAvailable = await checkCoreUpdate({ silent: true });
  if (!updateAvailable) return;
  await installCoreUpdate({ silent: true });
}

export async function restartLocalProxy() {
  const bridge = window.clovapiCli;
  if (!bridge?.proxyStop || !bridge?.proxyStart) {
    toast.error(t("toast.proxyUnsupported"));
    return;
  }
  await bridge.proxyStop({ suppressAutostart: false });
  const result = await bridge.proxyStart(store.proxyPort, store.proxyHost);
  await refreshProxyStatus();
  if (result?.ok) toast.success(t("toast.proxyRestarted"));
  else toast.error(result?.error || t("toast.proxyRestartFailed"));
}

export async function saveLocalProxyAddress() {
  const bridge = window.clovapiCli;
  if (!bridge?.proxyConfigSave || !bridge?.proxyStop || !bridge?.proxyStart) {
    toast.error(t("toast.proxyUnsupported"));
    return;
  }

  let parsed: { host: string; port: number };
  try {
    parsed = parseProxyAddress(store.proxyAddressDraft);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t("proxy.localAddressInvalid"));
    return;
  }

  const result = await bridge.proxyConfigSave({
    enabled: true,
    host: parsed.host,
    port: parsed.port,
  });
  if (!result?.ok) {
    toast.error(result?.error || t("proxy.localAddressSaveFailed"));
    return;
  }
  applyProxyConfig(result.proxy || parsed);
  await restartLocalProxy();
}

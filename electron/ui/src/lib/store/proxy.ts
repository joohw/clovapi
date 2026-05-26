import { t } from "../i18n";
import { store } from "./state.svelte";
import { toast } from "../toast";

type UpdateDetail = {
  current_version?: string;
  latest_version?: string;
  target_path?: string;
  updated?: boolean;
  up_to_date?: boolean;
};

function parseVersionFromHealthBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const version = (body as { version?: unknown }).version;
  return typeof version === "string" ? version.trim() : "";
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
    const bridge = window.clovapiProxy;
    if (bridge?.health) {
      try {
        const result = await bridge.health();
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
  const bridge = window.clovapiProxy;
  if (!bridge?.status) return;
  try {
    const result = await bridge.status();
    if (result?.ok) {
      store.proxyRunning = Boolean(result.running);
      store.proxyPort = Number(result.port) || store.proxyPort;
      store.proxyBaseUrl = result.baseUrl || `http://127.0.0.1:${store.proxyPort}`;
    }
  } catch {
    store.proxyRunning = false;
  }
  await refreshCoreVersion();
}

export async function refreshProxyLogs(offset = store.proxyLogsOffset) {
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.list || store.proxyLogsLoading) return;
  store.proxyLogsLoading = true;
  try {
    const pageSize = Number(store.proxyLogsPageSize) || 20;
    const nextOffset = Math.max(0, Number(offset) || 0);
    const result = await bridge.list({ limit: pageSize, offset: nextOffset });
    if (result?.ok) {
      if (Array.isArray(result.requests)) {
        store.proxyLogs = result.requests;
      }
      if (Array.isArray(result.sessions)) {
        store.proxyLogSessions = result.sessions;
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
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.clear) return;
  const result = await bridge.clear("calls");
  if (!result?.ok) {
    toast.error(result?.error || t("toast.proxyClearCallLogsFailed"));
    return;
  }
  store.proxyLogs = [];
  store.proxyLogSessions = [];
  store.proxyLogsOffset = 0;
  store.proxyLogsHasMore = false;
  store.proxyLogSelectedId = null;
  store.proxyLogSelectedSession = null;
}

export async function clearSystemLogs() {
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.clear) return;
  const result = await bridge.clear("system");
  if (!result?.ok) {
    toast.error(result?.error || t("toast.proxyClearSystemLogsFailed"));
    return;
  }
  store.proxySystemLogs = [];
  store.proxySystemLogSelectedId = null;
}

export async function runProxyHealthTest() {
  if (store.proxyHealthTest?.status === "testing") return;

  const bridge = window.clovapiProxy;
  if (!bridge?.health) {
    toast.error(t("toast.proxyHealthUnsupported"));
    return;
  }

  store.proxyHealthTest = {
    status: "testing",
    summary: t("common.testing"),
    detail: "",
  };

  try {
    const result = await bridge.health();
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

export async function checkCoreUpdate() {
  if (store.coreUpdateCheck?.status === "testing" || store.coreUpdating) return;

  const bridge = window.clovapiCli;
  if (!bridge?.updateCli) {
    toast.error(t("toast.coreUpdateUnsupported"));
    return;
  }

  store.coreUpdateCheck = {
    status: "testing",
    summary: t("common.testing"),
    detail: "",
  };

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
      store.coreUpdateCheck = {
        status: "fail",
        summary: result?.error || t("toast.coreUpdateCheckFailed"),
        detail: JSON.stringify(detail, null, 2),
      };
      return;
    }

    if (detail.up_to_date) {
      store.coreUpdateAvailable = false;
      store.coreLatestVersion = "";
      store.coreUpdateCheck = {
        status: "pass",
        summary: t("proxy.updateUpToDate"),
        detail: "",
        testedAt: Date.now(),
      };
      return;
    }

    store.coreUpdateAvailable = true;
    store.coreLatestVersion = detail.latest_version || "";
    store.coreUpdateCheck = {
      status: "pass",
      summary: t("proxy.updateAvailable", { latest: detail.latest_version || "?" }),
      detail: "",
      testedAt: Date.now(),
    };
  } catch (error) {
    store.coreUpdateAvailable = false;
    store.coreLatestVersion = "";
    store.coreUpdateCheck = {
      status: "fail",
      summary: error instanceof Error ? error.message : t("toast.coreUpdateCheckFailed"),
      detail: "",
    };
  }
}

export async function installCoreUpdate() {
  if (store.coreUpdating || store.coreUpdateCheck?.status === "testing") return;

  const bridge = window.clovapiCli;
  if (!bridge?.updateCli) {
    toast.error(t("toast.coreUpdateUnsupported"));
    return;
  }

  store.coreUpdating = true;
  store.coreUpdateCheck = {
    status: "testing",
    summary: t("proxy.updating"),
    detail: "",
  };

  try {
    const result = await bridge.updateCli({});
    const detail = (result?.detail || {}) as UpdateDetail;

    if (!result?.ok) {
      store.coreUpdateCheck = {
        status: "fail",
        summary: result?.error || t("toast.coreUpdateInstallFailed"),
        detail: JSON.stringify(detail, null, 2),
      };
      toast.error(result?.error || t("toast.coreUpdateInstallFailed"));
      return;
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
        detail: detail.target_path ? t("proxy.updateInstalledPath", { path: detail.target_path }) : "",
        testedAt: Date.now(),
      };
      toast.success(t("toast.coreUpdateInstalled"));
      await restartLocalProxy();
      await refreshCoreVersion();
      return;
    }

    store.coreUpdateCheck = {
      status: "pass",
      summary: t("proxy.updateUpToDate"),
      detail: "",
      testedAt: Date.now(),
    };
  } catch (error) {
    store.coreUpdateCheck = {
      status: "fail",
      summary: error instanceof Error ? error.message : t("toast.coreUpdateInstallFailed"),
      detail: "",
    };
    toast.error(error instanceof Error ? error.message : t("toast.coreUpdateInstallFailed"));
  } finally {
    store.coreUpdating = false;
  }
}

export async function restartLocalProxy() {
  const bridge = window.clovapiProxy;
  if (!bridge?.stop || !bridge?.start) {
    toast.error(t("toast.proxyUnsupported"));
    return;
  }
  await bridge.stop();
  const result = await bridge.start(store.proxyPort);
  await refreshProxyStatus();
  if (result?.ok) toast.success(t("toast.proxyRestarted"));
  else toast.error(result?.error || t("toast.proxyRestartFailed"));
}

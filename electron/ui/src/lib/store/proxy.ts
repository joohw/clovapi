import { isElectronDev } from "../constants";
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

type CoreUpdateOptions = {
  silent?: boolean;
};

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
      store.proxyPort = Number(result.port) || store.proxyPort;
      store.proxyBaseUrl = result.baseUrl || `http://127.0.0.1:${store.proxyPort}`;
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
    const result = await bridge.proxyLogsList({ limit: pageSize, offset: nextOffset });
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
  const bridge = window.clovapiCli;
  if (!bridge?.proxyLogsClear) return;
  const result = await bridge.proxyLogsClear("calls");
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

export async function deleteProxySession(session: string) {
  const key = String(session || "").trim();
  if (!key) return;

  const bridge = window.clovapiCli;
  if (!bridge?.proxyLogsDeleteSession) {
    toast.error(t("toast.proxyDeleteSessionUnsupported"));
    return;
  }

  const result = await bridge.proxyLogsDeleteSession(key);
  if (!result?.ok) {
    toast.error(result?.error || t("toast.proxyDeleteSessionFailed"));
    return;
  }

  if (store.proxyLogSelectedSession === key) {
    store.proxyLogSelectedSession = null;
    store.proxyLogSelectedId = null;
  }
  if (Array.isArray(result.requests)) {
    store.proxyLogs = result.requests;
  }
  if (Array.isArray(result.sessions)) {
    store.proxyLogSessions = result.sessions;
  }
  if (result.callLogPage) {
    store.proxyLogsOffset = Number(result.callLogPage.offset) || 0;
    store.proxyLogsPageSize = Number(result.callLogPage.limit) || store.proxyLogsPageSize;
    store.proxyLogsHasMore = Boolean(result.callLogPage.hasMore);
  }
  toast.success(t("toast.proxyDeleteSessionSuccess"));
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
  const result = await bridge.proxyStart(store.proxyPort);
  await refreshProxyStatus();
  if (result?.ok) toast.success(t("toast.proxyRestarted"));
  else toast.error(result?.error || t("toast.proxyRestartFailed"));
}

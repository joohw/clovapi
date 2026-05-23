import { store } from "./state.svelte";
import { toast } from "../toast";

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
}

export async function refreshProxyLogs() {
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.list || store.proxyLogsLoading) return;
  store.proxyLogsLoading = true;
  try {
    const result = await bridge.list();
    if (result?.ok) {
      if (Array.isArray(result.requests)) {
        store.proxyLogs = result.requests;
      }
      if (Array.isArray(result.system)) {
        store.proxySystemLogs = result.system;
      }
    }
  } finally {
    store.proxyLogsLoading = false;
  }
}

export async function clearCallLogs() {
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.clear) return;
  const result = await bridge.clear("calls");
  if (!result?.ok) {
    toast.error(result?.error || "清空调用日志失败");
    return;
  }
  store.proxyLogs = [];
  store.proxyLogSelectedId = null;
}

export async function clearSystemLogs() {
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.clear) return;
  const result = await bridge.clear("system");
  if (!result?.ok) {
    toast.error(result?.error || "清空系统日志失败");
    return;
  }
  store.proxySystemLogs = [];
  store.proxySystemLogSelectedId = null;
}

export async function runProxyHealthTest() {
  if (store.proxyHealthTest?.status === "testing") return;

  const bridge = window.clovapiProxy;
  if (!bridge?.health) {
    toast.error("当前环境不支持代理 Health 测试");
    return;
  }

  store.proxyHealthTest = {
    status: "testing",
    summary: "测试中…",
    detail: "",
  };

  try {
    const result = await bridge.health();
    await refreshProxyStatus();

    if (result?.ok && result.passed) {
      const latency = result.latencyMs != null ? `${result.latencyMs}ms` : "";
      store.proxyHealthTest = {
        status: "pass",
        summary: latency ? `Health OK · ${latency}` : "Health OK",
        detail: "",
      };
      return;
    }

    const reason = result?.error || "代理未响应 /health";
    store.proxyHealthTest = {
      status: "fail",
      summary: `Health 失败 · ${reason}`,
      detail: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health 测试失败";
    store.proxyHealthTest = {
      status: "fail",
      summary: `测试失败 · ${message}`,
      detail: "",
    };
  }
}

export async function restartLocalProxy() {
  const bridge = window.clovapiProxy;
  if (!bridge?.stop || !bridge?.start) {
    toast.error("当前环境不支持本地代理");
    return;
  }
  await bridge.stop();
  const result = await bridge.start(store.proxyPort);
  await refreshProxyStatus();
  if (result?.ok) toast.success("本地代理已重启");
  else toast.error(result?.error || "本地代理重启失败");
}

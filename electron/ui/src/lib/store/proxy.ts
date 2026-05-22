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
    if (result?.ok && Array.isArray(result.entries)) {
      store.proxyLogs = result.entries;
    }
  } finally {
    store.proxyLogsLoading = false;
  }
}

export async function clearProxyLogs() {
  const bridge = window.clovapiProxyLogs;
  if (!bridge?.clear) return;
  const result = await bridge.clear();
  if (!result?.ok) {
    toast.error(result?.error || "清空代理日志失败");
    return;
  }
  store.proxyLogs = [];
  store.proxyLogSelectedId = null;
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

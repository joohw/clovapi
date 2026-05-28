const { contextBridge, ipcRenderer } = require("electron");

/** IPC uses structured clone; strip Svelte proxies and other non-cloneable values. */
function cloneForIpc(value) {
  if (value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") return val.toString();
      if (val instanceof Error) return val.message;
      return val;
    }),
  );
}

contextBridge.exposeInMainWorld("clovapiEnv", {
  isDev: process.env.ELECTRON_DEV === "1",
});

contextBridge.exposeInMainWorld("clovapiCli", {
  run(command, cwd, env) {
    return ipcRenderer.invoke("cli:run", { command, cwd, env });
  },
  runClovapi(args, cwd) {
    return ipcRenderer.invoke("cli:run-clovapi", { args, cwd });
  },
  stop() {
    return ipcRenderer.invoke("cli:stop");
  },
  state() {
    return ipcRenderer.invoke("cli:state");
  },
  defaultCwd() {
    return ipcRenderer.invoke("cli:default-cwd");
  },
  toolStatus() {
    return ipcRenderer.invoke("cli:tool-status");
  },
  updateCli(payload) {
    return ipcRenderer.invoke("cli:update", payload || {});
  },
  which(command) {
    return ipcRenderer.invoke("cli:which", { command });
  },
  onOutput(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("cli:output", listener);
    return () => ipcRenderer.removeListener("cli:output", listener);
  },
  onExit(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("cli:exit", listener);
    return () => ipcRenderer.removeListener("cli:exit", listener);
  },
});

contextBridge.exposeInMainWorld("clovapiSubscription", {
  status() {
    return ipcRenderer.invoke("subscription:status");
  },
  login(provider) {
    return ipcRenderer.invoke("subscription:login", { provider });
  },
  cancelLogin(provider) {
    return ipcRenderer.invoke("subscription:login-cancel", { provider });
  },
  logout(provider) {
    return ipcRenderer.invoke("subscription:logout", { provider });
  },
});

contextBridge.exposeInMainWorld("clovapiProxy", {
  status() {
    return ipcRenderer.invoke("proxy:status");
  },
  health() {
    return ipcRenderer.invoke("proxy:health");
  },
  start(port) {
    return ipcRenderer.invoke("proxy:start", { port });
  },
  stop(options) {
    return ipcRenderer.invoke("proxy:stop", cloneForIpc(options || {}));
  },
});

contextBridge.exposeInMainWorld("clovapiProxyLogs", {
  list(payload) {
    return ipcRenderer.invoke("proxy-logs:list", cloneForIpc(payload || {}));
  },
  clear(scope) {
    return ipcRenderer.invoke("proxy-logs:clear", { scope });
  },
});

contextBridge.exposeInMainWorld("clovapiDesktop", {
  onAppEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:event", listener);
    return () => ipcRenderer.removeListener("app:event", listener);
  },
});

contextBridge.exposeInMainWorld("clovapiProfiles", {
  load() {
    return ipcRenderer.invoke("profiles:load");
  },
  save(payload) {
    return ipcRenderer.invoke("profiles:save", cloneForIpc(payload));
  },
  test(payload) {
    const body =
      typeof payload === "string"
        ? { binding: payload }
        : {
            binding: payload?.binding,
            provider: payload?.provider,
            provider_id: payload?.provider_id,
            model: payload?.model,
            model_id: payload?.model_id,
            cli: payload?.cli,
            vendors: payload?.vendors,
            active: payload?.active,
            proxy: payload?.proxy,
          };
    return ipcRenderer.invoke("profiles:test", cloneForIpc(body));
  },
  listModels(vendorName) {
    return ipcRenderer.invoke("profiles:list-models", { vendorName });
  },
  queryUsage(vendorName) {
    return ipcRenderer.invoke("profiles:usage", { vendorName });
  },
  modelAdapters() {
    return ipcRenderer.invoke("profiles:model-adapters");
  },
});

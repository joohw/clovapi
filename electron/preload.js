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

try {
  contextBridge.exposeInMainWorld("clovapiEnv", {
    isDev: process.env.ELECTRON_DEV === "1",
    getVersion() {
      return ipcRenderer.invoke("app:version");
    },
  });

  contextBridge.exposeInMainWorld("clovapiCli", {
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
    authStatus() {
      return ipcRenderer.invoke("cli:auth-status");
    },
    authLogin(provider) {
      return ipcRenderer.invoke("cli:auth-login", { provider });
    },
    cancelAuthLogin(provider) {
      return ipcRenderer.invoke("cli:auth-login-cancel", { provider });
    },
    authLogout(provider) {
      return ipcRenderer.invoke("cli:auth-logout", { provider });
    },
    proxyStatus() {
      return ipcRenderer.invoke("cli:proxy-status");
    },
    proxyHealth() {
      return ipcRenderer.invoke("cli:proxy-health");
    },
    proxyStart(port, host) {
      return ipcRenderer.invoke("cli:proxy-start", { port, host });
    },
    proxyConfigSave(payload) {
      return ipcRenderer.invoke("cli:proxy-config-save", cloneForIpc(payload || {}));
    },
    proxyStop(options) {
      return ipcRenderer.invoke("cli:proxy-stop", cloneForIpc(options || {}));
    },
    proxyLogsList(payload) {
      return ipcRenderer.invoke("cli:proxy-logs-list", cloneForIpc(payload || {}));
    },
    proxyLogsClear(scope) {
      return ipcRenderer.invoke("cli:proxy-logs-clear", { scope });
    },
    profilesLoad() {
      return ipcRenderer.invoke("cli:profiles-load");
    },
    profilesSave(payload) {
      return ipcRenderer.invoke("cli:profiles-save", cloneForIpc(payload));
    },
    profilesTest(payload) {
      const body =
        typeof payload === "string"
          ? { binding: payload }
          : {
              binding: payload?.binding,
              provider: payload?.provider,
              provider_id: payload?.provider_id,
              model: payload?.model,
              model_id: payload?.model_id,
              vendors: payload?.vendors,
              proxy: payload?.proxy,
            };
      return ipcRenderer.invoke("cli:profiles-test", cloneForIpc(body));
    },
    profilesListModels(vendorName) {
      return ipcRenderer.invoke("cli:profiles-list-models", { vendorName });
    },
    profilesModels() {
      return ipcRenderer.invoke("cli:profiles-models");
    },
    profilesUsage(vendorName) {
      return ipcRenderer.invoke("cli:profiles-usage", { vendorName });
    },
    profilesCatalog() {
      return ipcRenderer.invoke("cli:profiles-catalog");
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

  contextBridge.exposeInMainWorld("clovapiDesktop", {
    onAppEvent(callback) {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("app:event", listener);
      return () => ipcRenderer.removeListener("app:event", listener);
    },
    checkUpdate() {
      return ipcRenderer.invoke("desktop:check-update");
    },
    installUpdate() {
      return ipcRenderer.invoke("desktop:install-update");
    },
  });

} catch (error) {
  console.error("[preload] failed to expose desktop bridges:", error);
}

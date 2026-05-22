const { contextBridge, ipcRenderer } = require("electron");

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
  claudeProfile(targetCli) {
    return ipcRenderer.invoke("subscription:claude-profile", { targetCli });
  },
  buildProfile(provider, targetCli) {
    return ipcRenderer.invoke("subscription:build-profile", { provider, targetCli });
  },
  logout(provider) {
    return ipcRenderer.invoke("subscription:logout", { provider });
  },
});

contextBridge.exposeInMainWorld("clovapiProxy", {
  status() {
    return ipcRenderer.invoke("proxy:status");
  },
  start(port) {
    return ipcRenderer.invoke("proxy:start", { port });
  },
  stop() {
    return ipcRenderer.invoke("proxy:stop");
  },
  ensureStub(cliKind, binding) {
    return ipcRenderer.invoke("proxy:ensure-stub", { cliKind, binding });
  },
  buildIngress(cliKind, binding) {
    return ipcRenderer.invoke("proxy:build-ingress", { cliKind, binding });
  },
});

contextBridge.exposeInMainWorld("clovapiProxyLogs", {
  list() {
    return ipcRenderer.invoke("proxy-logs:list");
  },
  clear() {
    return ipcRenderer.invoke("proxy-logs:clear");
  },
});

contextBridge.exposeInMainWorld("clovapiProfiles", {
  load() {
    return ipcRenderer.invoke("profiles:load");
  },
  save(payload) {
    return ipcRenderer.invoke("profiles:save", payload);
  },
  test(payload) {
    const body =
      typeof payload === "string"
        ? { binding: payload }
        : {
            binding: payload?.binding,
            vendors: payload?.vendors,
            active: payload?.active,
            proxy: payload?.proxy,
          };
    return ipcRenderer.invoke("profiles:test", body);
  },
  listModels(vendorName) {
    return ipcRenderer.invoke("profiles:list-models", { vendorName });
  },
  modelAdapters() {
    return ipcRenderer.invoke("profiles:model-adapters");
  },
});

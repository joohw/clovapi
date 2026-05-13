const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clovapiCli", {
  run(command, cwd, env) {
    return ipcRenderer.invoke("cli:run", { command, cwd, env });
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
  }
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clovapiCli", {
  run(command, cwd) {
    return ipcRenderer.invoke("cli:run", { command, cwd });
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

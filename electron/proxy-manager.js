const profileStore = require("./profile-store");
const { createLocalProxyServer } = require("./local-proxy");

const DEFAULT_PORT = 27483;
const DEFAULT_HOST = "127.0.0.1";

/** @type {import('node:http').Server | null} */
let server = null;
/** @type {number | null} */
let listeningPort = null;

function defaultProxyConfig() {
  return { enabled: true, host: DEFAULT_HOST, port: DEFAULT_PORT };
}

async function loadProxyConfig() {
  const store = await profileStore.loadStore();
  const cfg = store.proxy && typeof store.proxy === "object" ? store.proxy : {};
  return {
    enabled: true,
    host: String(cfg.host || DEFAULT_HOST).trim() || DEFAULT_HOST,
    port: Number(cfg.port) || DEFAULT_PORT,
  };
}

async function saveProxyConfig(patch) {
  const store = await profileStore.loadStore();
  const current = await loadProxyConfig();
  store.proxy = { ...current, ...patch };
  await profileStore.saveStore(store);
  return store.proxy;
}

function status() {
  return {
    running: Boolean(server && server.listening),
    port: listeningPort || DEFAULT_PORT,
    host: DEFAULT_HOST,
    baseUrl: `http://${DEFAULT_HOST}:${listeningPort || DEFAULT_PORT}`,
  };
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    if (server?.listening) {
      resolve({ ok: true, port: listeningPort, alreadyRunning: true });
      return;
    }

    const chosenPort = Number(port) || DEFAULT_PORT;
    const instance = createLocalProxyServer({ port: chosenPort });
    instance.on("error", reject);
    instance.listen(chosenPort, DEFAULT_HOST, () => {
      server = instance;
      listeningPort = chosenPort;
      resolve({ ok: true, port: chosenPort, alreadyRunning: false });
    });
  });
}

async function start(options = {}) {
  const cfg = await loadProxyConfig();
  const port = Number(options.port) || cfg.port || DEFAULT_PORT;
  try {
    const result = await startServer(port);
    return { ok: true, ...status(), ...result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start local proxy",
      ...status(),
    };
  }
}

function stop() {
  return new Promise((resolve) => {
    if (!server) {
      resolve({ ok: true, running: false });
      return;
    }
    const ref = server;
    ref.close(() => {
      if (server === ref) {
        server = null;
        listeningPort = null;
      }
      resolve({ ok: true, running: false });
    });
  });
}

async function ensureRunning() {
  const st = status();
  if (st.running) return { ok: true, ...st };
  return start();
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_HOST,
  defaultProxyConfig,
  loadProxyConfig,
  saveProxyConfig,
  status,
  start,
  stop,
  ensureRunning,
};

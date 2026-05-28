import { activeSelection, normalizeVendor } from "../helpers";
import { refreshProxyLogs } from "./proxy";
import { store } from "./state.svelte";

type PersistResult = Awaited<ReturnType<NonNullable<typeof window.clovapiProfiles>["save"]>>;

let persistTail: Promise<PersistResult | undefined> = Promise.resolve(undefined);

function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeActive(raw: unknown) {
  const out: typeof store.active = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      const parts = value.split("/", 2);
      if (parts.length === 2) {
        const providerId = parts[0].trim();
        const modelId = parts[1].trim();
        if (providerId && modelId) out[kind] = activeSelection(providerId, modelId);
      }
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const row = value as { provider_id?: string; model_id?: string; providerId?: string; modelId?: string };
    const providerId = String(row.provider_id || row.providerId || "").trim();
    const modelId = String(row.model_id || row.modelId || "").trim();
    if (providerId && modelId) out[kind] = activeSelection(providerId, modelId);
  }
  return out;
}

function activeForSave() {
  return normalizeActive(store.active);
}

export async function persistProfiles() {
  const run = async (): Promise<PersistResult | undefined> => {
    const bridge = window.clovapiProfiles;
    if (!bridge?.save) return { ok: false, error: "Profile bridge unavailable" };
    const payload = cloneForIpc({
      profiles: store.profiles,
      active: activeForSave(),
      proxy: {
        enabled: true,
        host: "127.0.0.1",
        port: store.proxyPort,
      },
    });
    const result = await bridge.save(payload);
    if (result?.ok) {
      store.profiles = (result.profiles || []).map(normalizeVendor);
      store.active = normalizeActive(result.active);
      if (result.proxy) {
        store.proxyPort = Number(result.proxy.port) || 27483;
        store.proxyBaseUrl = `http://127.0.0.1:${store.proxyPort}`;
      }
      if (result.path) store.profilesPath = result.path;
      void refreshProxyLogs();
    }
    return result;
  };

  persistTail = persistTail.then(run, run);
  return persistTail;
}

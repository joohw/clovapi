import { normalizeVendor } from "../helpers";
import { refreshProxyLogs } from "./proxy";
import { store } from "./state.svelte";

type PersistResult = Awaited<ReturnType<NonNullable<typeof window.clovapiProfiles>["save"]>>;

let persistTail: Promise<PersistResult | undefined> = Promise.resolve(undefined);

function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function persistProfiles() {
  const run = async (): Promise<PersistResult | undefined> => {
    const bridge = window.clovapiProfiles;
    if (!bridge?.save) return { ok: false, error: "Profile bridge unavailable" };
    const payload = cloneForIpc({
      profiles: store.profiles,
      active: { ...store.active },
      proxy: {
        enabled: true,
        host: "127.0.0.1",
        port: store.proxyPort,
      },
    });
    const result = await bridge.save(payload);
    if (result?.ok) {
      store.profiles = (result.profiles || []).map(normalizeVendor);
      store.active = result.active && typeof result.active === "object" ? { ...result.active } : {};
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

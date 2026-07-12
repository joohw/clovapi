import { normalizeRouteBackend, normalizeSubscriptionAccount, normalizeVendor } from "../helpers";
import { refreshProxyLogs } from "./proxy";
import { store } from "./state.svelte";
import { applyVendorUsageCache, applyVendorUsageFromProfiles } from "./vendor-usage";

type PersistResult = Awaited<ReturnType<NonNullable<typeof window.clovapiCli>["profilesSave"]>>;

let persistTail: Promise<PersistResult | undefined> = Promise.resolve(undefined);

function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function persistProfiles() {
  const run = async (): Promise<PersistResult | undefined> => {
    const bridge = window.clovapiCli;
    if (!bridge?.profilesSave) return { ok: false, error: "Profile bridge unavailable" };
    const payload = cloneForIpc({
      profiles: store.profiles,
      subscriptionAccounts: store.subscriptionAccounts,
      routeBackends: store.routeBackends,
      proxy: {
        enabled: true,
        host: store.proxyHost || "127.0.0.1",
        port: store.proxyPort,
      },
    });
    const result = await bridge.profilesSave(payload);
    if (result?.ok) {
      store.profiles = (result.profiles || []).map(normalizeVendor);
      store.subscriptionAccounts = (result.subscriptionAccounts || []).map(normalizeSubscriptionAccount);
      store.routeBackends = (result.routeBackends || []).map(normalizeRouteBackend);
      applyVendorUsageFromProfiles(store.profiles);
      applyVendorUsageCache(result.usageCache?.usages || []);
      if (result.proxy) {
        store.proxyHost = String(result.proxy.host || store.proxyHost || "127.0.0.1");
        store.proxyPort = Number(result.proxy.port) || 27483;
        const displayHost =
          store.proxyHost === "0.0.0.0" || store.proxyHost === "::" ? "127.0.0.1" : store.proxyHost;
        store.proxyBaseUrl = `http://${displayHost}:${store.proxyPort}`;
        store.proxyAddressDraft = store.proxyBaseUrl;
      }
      if (result.path) store.profilesPath = result.path;
      void refreshProxyLogs();
    }
    return result;
  };

  persistTail = persistTail.then(run, run);
  return persistTail;
}

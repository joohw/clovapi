import { normalizeVendor } from "../helpers";
import { store } from "./state.svelte";

export async function persistProfiles() {
  const bridge = window.clovapiProfiles;
  if (!bridge?.save) return { ok: false, error: "Profile bridge unavailable" };
  const result = await bridge.save({
    profiles: store.profiles,
    active: store.active,
    proxy: {
      enabled: true,
      host: "127.0.0.1",
      port: store.proxyPort,
    },
  });
  if (result?.ok) {
    store.profiles = (result.profiles || []).map(normalizeVendor);
    store.active = result.active && typeof result.active === "object" ? result.active : {};
    if (result.proxy) {
      store.proxyPort = Number(result.proxy.port) || 27483;
      store.proxyBaseUrl = `http://127.0.0.1:${store.proxyPort}`;
    }
    if (result.path) store.profilesPath = result.path;
  }
  return result;
}

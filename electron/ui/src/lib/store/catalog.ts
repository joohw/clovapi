import { store } from "./state.svelte";

export async function loadVendorCatalog() {
  const bridge = window.clovapiProfiles;
  if (!bridge?.modelAdapters) return;
  try {
    const result = await bridge.modelAdapters();
    if (!result?.ok) return;
    if (Array.isArray(result.adapters)) {
      store.modelAdapters = result.adapters;
    }
    if (Array.isArray(result.providers)) {
      store.providers = result.providers;
    }
    if (Array.isArray(result.fixedProviderIds) && result.fixedProviderIds.length) {
      store.fixedProviderIds = result.fixedProviderIds;
    }
  } catch {
    /* non-fatal */
  }
}

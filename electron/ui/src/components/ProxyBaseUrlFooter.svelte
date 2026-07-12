<script lang="ts">
  import { copyTextWithToast } from "../lib/clipboard";
  import { i18n, t } from "../lib/i18n";
  import { store, testProxyHealth } from "../lib/store.svelte";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      label: t("app.localProxyBaseUrl"),
      hint: t("app.clickToCopyProxyBaseUrl"),
      running: t("app.localProxyRunning"),
      stopped: t("app.localProxyStopped"),
      testing: t("app.localProxyTesting"),
    };
  });

  const displayUrl = $derived(store.proxyBaseUrl.trim() || `http://127.0.0.1:${store.proxyPort}`);
  const statusLabel = $derived(
    store.proxyStatusTesting ? copy.testing : store.proxyRunning ? copy.running : copy.stopped,
  );

  async function copyBaseUrl() {
    await copyTextWithToast(displayUrl);
  }
</script>

<footer
  class="electron-no-drag fixed bottom-0 left-1/2 z-10 flex min-h-12 w-full max-w-3xl -translate-x-1/2 items-center bg-gradient-to-t from-background via-background/88 via-55% to-transparent px-5 pb-2 pt-5"
>
  <button
    type="button"
    class="flex min-h-6 min-w-0 flex-1 items-center gap-2 px-1 py-0.5 text-left text-xs opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    onclick={() => void copyBaseUrl()}
    title={copy.hint}
    aria-label={`${copy.label}: ${displayUrl}. ${copy.hint}`}
  >
    <span class="shrink-0 text-muted-foreground">{copy.label}</span>
    <span class="min-w-0 flex-1 truncate font-mono text-foreground">{displayUrl}</span>
  </button>
  <button
    type="button"
    class="grid size-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    aria-label={statusLabel}
    title={statusLabel}
    disabled={store.proxyStatusTesting}
    onclick={() => void testProxyHealth()}
  >
    <span
      class="size-2 rounded-full {store.proxyStatusTesting ? 'animate-pulse bg-amber-500' : store.proxyRunning ? 'bg-emerald-500' : 'bg-muted-foreground/35'}"
      aria-hidden="true"
    ></span>
  </button>
</footer>

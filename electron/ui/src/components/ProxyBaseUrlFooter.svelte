<script lang="ts">
  import { copyTextWithToast } from "../lib/clipboard";
  import { i18n, t } from "../lib/i18n";
  import { store } from "../lib/store.svelte";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      label: t("app.localProxyBaseUrl"),
      hint: t("app.clickToCopyProxyBaseUrl"),
    };
  });

  const displayUrl = $derived(store.proxyBaseUrl.trim() || `http://127.0.0.1:${store.proxyPort}`);

  async function copyBaseUrl() {
    await copyTextWithToast(displayUrl);
  }
</script>

<footer
  class="electron-no-drag fixed bottom-0 left-1/2 z-10 w-full max-w-3xl -translate-x-1/2 bg-background/95 px-5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80"
>
  <button
    type="button"
    class="flex w-full min-w-0 items-center gap-2 px-1 py-0.5 text-left text-xs opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    onclick={() => void copyBaseUrl()}
    title={copy.hint}
    aria-label={`${copy.label}: ${displayUrl}. ${copy.hint}`}
  >
    <span class="shrink-0 text-muted-foreground">{copy.label}</span>
    <span class="min-w-0 flex-1 truncate font-mono text-foreground">{displayUrl}</span>
  </button>
</footer>

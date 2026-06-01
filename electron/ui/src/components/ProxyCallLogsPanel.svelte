<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { i18n, t } from "../lib/i18n";
  import {
    clearCallLogs,
    closeProxyLog,
    nextProxyLogsPage,
    openProxyLog,
    previousProxyLogsPage,
    refreshProxyLogs,
    store,
  } from "../lib/store.svelte";
  import {
    proxyLogCardTitle,
    proxyLogStatusClass,
    proxyLogSummary,
    proxyLogVendorName,
  } from "../lib/proxy-log-format";
  import ListRow from "./ListRow.svelte";
  import ProxyLogDetailPanel from "./ProxyLogDetailPanel.svelte";
  import SectionCard from "./SectionCard.svelte";
  import VendorIcon from "./VendorIcon.svelte";

  const selectedLog = $derived(
    store.proxyLogSelectedId
      ? store.proxyLogs.find((entry) => entry.id === store.proxyLogSelectedId)
      : undefined,
  );
  const inLogDetail = $derived(Boolean(store.proxyLogSelectedId));
  let clearConfirmOpen = $state(false);

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      back: t("common.back"),
      title: t("callLogs.title"),
      description: t("callLogs.description"),
      refresh: t("common.refresh"),
      refreshing: t("common.refreshing"),
      clear: t("common.clear"),
      empty: t("callLogs.empty"),
      previous: t("common.previous"),
      next: t("common.next"),
      cancel: t("common.cancel"),
      clearConfirmTitle: t("callLogs.clearConfirmTitle"),
      clearConfirmDescription: t("callLogs.clearConfirmDescription"),
      clearConfirmAction: t("callLogs.clearConfirmAction"),
    };
  });

  const pageNumber = $derived(Math.floor(store.proxyLogsOffset / store.proxyLogsPageSize) + 1);

  function confirmClearLogs() {
    clearConfirmOpen = false;
    void clearCallLogs();
  }

  function providerIdForLog(entry: (typeof store.proxyLogs)[number]): string {
    const vendor = proxyLogVendorName(entry).toLowerCase();
    if (vendor === "codex") return "codex";
    if (vendor === "claude" || vendor === "claude-code") return "claude-code";
    if (vendor === "ollama") return "ollama";
    return "custom-api";
  }

  $effect(() => {
    if (store.proxyLogSelectedId && !selectedLog) {
      closeProxyLog();
    }
  });
</script>

{#if inLogDetail && selectedLog}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={() => closeProxyLog()}>
      <ArrowLeftIcon class="size-4" />
      {copy.back}
    </Button>
    <ProxyLogDetailPanel entry={selectedLog} />
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <SectionCard title={copy.title} description={copy.description}>
      {#snippet actions()}
        <Button
          size="sm"
          variant="outline"
          disabled={store.proxyLogsLoading}
          onclick={() => void refreshProxyLogs()}
        >
          {store.proxyLogsLoading ? copy.refreshing : copy.refresh}
        </Button>
        <Button size="sm" variant="outline" onclick={() => (clearConfirmOpen = true)}>
          {copy.clear}
        </Button>
      {/snippet}

      {#if !store.proxyLogs.length}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
      {:else}
        {#each store.proxyLogs as entry (entry.id)}
          <ListRow
            title={proxyLogCardTitle(entry)}
            linesNowrap
            centerContent
            onOpen={() => openProxyLog(entry.id)}
            stopActionsPropagation={false}
            titleClass={proxyLogStatusClass(entry.upstream.status)}
          >
            {#snippet leading()}
              <VendorIcon providerId={providerIdForLog(entry)} class="size-7 rounded-md p-1" />
            {/snippet}
            {#snippet actions()}
              <span class="shrink-0 text-xs text-muted-foreground">
                {proxyLogSummary(entry)}
              </span>
              <ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
            {/snippet}
          </ListRow>
        {/each}
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            disabled={store.proxyLogsLoading || store.proxyLogsOffset <= 0}
            onclick={() => void previousProxyLogsPage()}
          >
            {copy.previous}
          </Button>
          <span class="text-xs text-muted-foreground">Page {pageNumber}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={store.proxyLogsLoading || !store.proxyLogsHasMore}
            onclick={() => void nextProxyLogsPage()}
          >
            {copy.next}
          </Button>
        </div>
      {/if}
    </SectionCard>

    <Dialog.Root bind:open={clearConfirmOpen}>
      <Dialog.Content showCloseButton={false} class="sm:max-w-md">
        <div class="flex flex-col gap-4">
          <Dialog.Header>
            <Dialog.Title>{copy.clearConfirmTitle}</Dialog.Title>
            <Dialog.Description>{copy.clearConfirmDescription}</Dialog.Description>
          </Dialog.Header>

          <Dialog.Footer class="border-t border-border pt-4">
            <Button type="button" variant="outline" onclick={() => (clearConfirmOpen = false)}>
              {copy.cancel}
            </Button>
            <Button type="button" variant="destructive" onclick={confirmClearLogs}>
              {copy.clearConfirmAction}
            </Button>
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  </div>
{/if}

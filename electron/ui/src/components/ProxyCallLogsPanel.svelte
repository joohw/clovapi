<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { i18n, t } from "../lib/i18n";
  import {
    clearCallLogs,
    closeProxyLog,
    openProxyLog,
    refreshProxyLogs,
    store,
  } from "../lib/store.svelte";
  import {
    proxyLogCardTitle,
    proxyLogStatusClass,
    proxyLogSummary,
  } from "../lib/proxy-log-format";
  import ListRow from "./ListRow.svelte";
  import ProxyLogDetailPanel from "./ProxyLogDetailPanel.svelte";
  import SectionCard from "./SectionCard.svelte";

  const selectedLog = $derived(
    store.proxyLogSelectedId
      ? store.proxyLogs.find((entry) => entry.id === store.proxyLogSelectedId)
      : undefined,
  );
  const inLogDetail = $derived(Boolean(store.proxyLogSelectedId));

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
      details: t("common.details"),
    };
  });

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
        <Button size="sm" variant="outline" onclick={() => void clearCallLogs()}>
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
            onOpen={() => openProxyLog(entry.id)}
          >
            {#snippet actions()}
              <span class={`shrink-0 text-xs ${proxyLogStatusClass(entry.upstream.status)}`}>
                {proxyLogSummary(entry)}
              </span>
              <Button size="sm" variant="outline" type="button" onclick={() => openProxyLog(entry.id)}>
                {copy.details}
                <ChevronRightIcon class="size-4" />
              </Button>
            {/snippet}
          </ListRow>
        {/each}
      {/if}
    </SectionCard>
  </div>
{/if}

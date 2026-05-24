<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { i18n, t } from "../lib/i18n";
  import {
    clearSystemLogs,
    closeProxyLog,
    openProxySystemLog,
    refreshProxyLogs,
    store,
  } from "../lib/store.svelte";
  import {
    proxySystemLogStreamClass,
    proxySystemLogSummary,
    proxySystemLogTitle,
  } from "../lib/proxy-log-format";
  import ListRow from "./ListRow.svelte";
  import ProxySystemLogDetailPanel from "./ProxySystemLogDetailPanel.svelte";
  import SectionCard from "./SectionCard.svelte";

  const selectedLog = $derived(
    store.proxySystemLogSelectedId
      ? store.proxySystemLogs.find((entry) => entry.id === store.proxySystemLogSelectedId)
      : undefined,
  );
  const inLogDetail = $derived(Boolean(store.proxySystemLogSelectedId));

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      back: t("common.back"),
      title: t("systemLogs.title"),
      description: t("systemLogs.description"),
      refresh: t("common.refresh"),
      refreshing: t("common.refreshing"),
      clear: t("common.clear"),
      empty: t("systemLogs.empty"),
      details: t("common.details"),
    };
  });

  $effect(() => {
    if (store.proxySystemLogSelectedId && !selectedLog) {
      closeProxyLog();
    }
  });

  onMount(() => {
    void refreshProxyLogs();
  });
</script>

{#if inLogDetail && selectedLog}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={() => closeProxyLog()}>
      <ArrowLeftIcon class="size-4" />
      {copy.back}
    </Button>
    <ProxySystemLogDetailPanel entry={selectedLog} />
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
        <Button size="sm" variant="outline" onclick={() => void clearSystemLogs()}>
          {copy.clear}
        </Button>
      {/snippet}

      {#if !store.proxySystemLogs.length}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
      {:else}
        {#each store.proxySystemLogs as entry (entry.id)}
          <ListRow
            title={proxySystemLogTitle(entry)}
            linesNowrap
            onOpen={() => openProxySystemLog(entry.id)}
          >
            {#snippet actions()}
              <span class={`shrink-0 text-xs ${proxySystemLogStreamClass(entry.stream)}`}>
                {proxySystemLogSummary(entry)}
              </span>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onclick={() => openProxySystemLog(entry.id)}
              >
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

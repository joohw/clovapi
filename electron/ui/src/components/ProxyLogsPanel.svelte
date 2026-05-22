<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import {
    clearProxyLogs,
    closeProxyLog,
    openProxyLog,
    refreshProxyLogs,
    store,
  } from "../lib/store.svelte";
  import {
    formatProxyLogTime,
    proxyLogStatusClass,
    proxyLogSummary,
  } from "../lib/proxy-log-format";
  import ListRow from "./ListRow.svelte";
  import ProxyLogDetailPanel from "./ProxyLogDetailPanel.svelte";
  import SectionCard from "./SectionCard.svelte";

  const selectedLogId = $derived(store.proxyLogSelectedId);
  const selectedLog = $derived(
    selectedLogId ? store.proxyLogs.find((entry) => entry.id === selectedLogId) : undefined,
  );
  const inLogDetail = $derived(Boolean(selectedLogId));

  $effect(() => {
    if (selectedLogId && !selectedLog) {
      closeProxyLog();
    }
  });

  function openLog(id: string) {
    openProxyLog(id);
  }

  function goBack() {
    closeProxyLog();
  }
</script>

{#if inLogDetail && selectedLog}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={goBack}>
      <ArrowLeftIcon class="size-4" />
      返回
    </Button>
    <ProxyLogDetailPanel entry={selectedLog} />
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <SectionCard
      title="代理日志"
      description="记录本地代理收到的请求，以及发往上游后的原始响应片段。"
    >
      {#snippet actions()}
        <Button
          size="sm"
          variant="outline"
          disabled={store.proxyLogsLoading}
          onclick={() => void refreshProxyLogs()}
        >
          {store.proxyLogsLoading ? "刷新中…" : "刷新"}
        </Button>
        <Button size="sm" variant="outline" onclick={() => void clearProxyLogs()}>
          清空
        </Button>
      {/snippet}

      {#if !store.proxyLogs.length}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">暂无代理请求日志。</p>
      {:else}
        {#each store.proxyLogs as entry (entry.id)}
          <ListRow
            title="{entry.request.method} {entry.request.url}"
            lines={[entry.upstream.url, formatProxyLogTime(entry.startedAt)]}
            onOpen={() => openLog(entry.id)}
          >
            {#snippet actions()}
              <span class={`shrink-0 text-xs ${proxyLogStatusClass(entry.upstream.status)}`}>
                {proxyLogSummary(entry)}
              </span>
              <Button size="sm" variant="outline" type="button" onclick={() => openLog(entry.id)}>
                详情
                <ChevronRightIcon class="size-4" />
              </Button>
            {/snippet}
          </ListRow>
        {/each}
      {/if}
    </SectionCard>
  </div>
{/if}

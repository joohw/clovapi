<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import {
    clearSystemLogs,
    closeProxyLog,
    openProxySystemLog,
    refreshProxyLogs,
    store,
  } from "../lib/store.svelte";
  import {
    formatProxyLogTime,
    proxySystemLogPreview,
    proxySystemLogStreamClass,
    proxySystemLogStreamLabel,
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

  $effect(() => {
    if (store.proxySystemLogSelectedId && !selectedLog) {
      closeProxyLog();
    }
  });
</script>

{#if inLogDetail && selectedLog}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={() => closeProxyLog()}>
      <ArrowLeftIcon class="size-4" />
      返回
    </Button>
    <ProxySystemLogDetailPanel entry={selectedLog} />
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <SectionCard title="系统日志" description="记录代理启动、停止及进程调试输出。">
      {#snippet actions()}
        <Button
          size="sm"
          variant="outline"
          disabled={store.proxyLogsLoading}
          onclick={() => void refreshProxyLogs()}
        >
          {store.proxyLogsLoading ? "刷新中…" : "刷新"}
        </Button>
        <Button size="sm" variant="outline" onclick={() => void clearSystemLogs()}>
          清空
        </Button>
      {/snippet}

      {#if !store.proxySystemLogs.length}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">暂无系统日志。</p>
      {:else}
        {#each store.proxySystemLogs as entry (entry.id)}
          <ListRow
            title={proxySystemLogPreview(entry)}
            lines={[proxySystemLogStreamLabel(entry.stream), formatProxyLogTime(entry.at)]}
            onOpen={() => openProxySystemLog(entry.id)}
          >
            {#snippet actions()}
              <span class={`shrink-0 text-xs ${proxySystemLogStreamClass(entry.stream)}`}>
                {proxySystemLogStreamLabel(entry.stream)}
              </span>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onclick={() => openProxySystemLog(entry.id)}
              >
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

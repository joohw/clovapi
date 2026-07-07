<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";
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
    formatProxyLogTime,
    proxyLogCardTitle,
    proxyLogStatusClass,
    proxyLogSummary,
    proxyLogVendorName,
  } from "../lib/proxy-log-format";
  import type { ProxyLogAPIKeyAggregate } from "../global";
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
  const inApiKeyDetail = $derived(
    Boolean(store.proxyLogSelectedApiKeyFingerprint) || store.proxyLogSelectedApiKeyUnidentified,
  );
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
      apiKeyAggregation: t("callLogs.apiKeyAggregation"),
      apiKeyAggregationDesc: t("callLogs.apiKeyAggregationDesc"),
      apiKeyUnknown: t("callLogs.apiKeyUnknown"),
      apiKeyCalls: (count: number) => t("callLogs.apiKeyCalls", { count }),
      apiKeyErrors: (count: number) => t("callLogs.apiKeyErrors", { count }),
      apiKeyLastSeen: (time: string) => t("callLogs.apiKeyLastSeen", { time }),
      inputTokens: t("callLogs.inputTokens"),
      outputTokens: t("callLogs.outputTokens"),
      totalTokens: t("callLogs.totalTokens"),
      toolCalls: t("callLogs.toolCalls"),
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

  function apiKeyAggregateTitle(aggregate: ProxyLogAPIKeyAggregate): string {
    const label = String(aggregate.apiKey?.label || "").trim();
    const fingerprint = String(aggregate.apiKey?.fingerprint || "").trim();
    if (label && fingerprint) return `${label} · #${fingerprint}`;
    if (label) return label;
    if (fingerprint) return `#${fingerprint}`;
    return copy.apiKeyUnknown;
  }

  function apiKeyAggregateSummary(aggregate: ProxyLogAPIKeyAggregate): string {
    const parts = [copy.apiKeyCalls(Number(aggregate.count) || 0)];
    const usage = apiKeyAggregateTokenUsage(aggregate);
    if (usage) parts.push(usage);
    if (aggregate.toolCallCount) parts.push(`${copy.toolCalls} ${aggregate.toolCallCount}`);
    if (aggregate.errorCount) parts.push(copy.apiKeyErrors(aggregate.errorCount));
    return parts.join(" · ");
  }

  function apiKeyAggregateTokenUsage(aggregate: ProxyLogAPIKeyAggregate): string {
    const parts = [];
    if (aggregate.totalTokens) parts.push(`${copy.totalTokens}${aggregate.totalTokens}`);
    if (aggregate.inputTokens) parts.push(`${copy.inputTokens}${aggregate.inputTokens}`);
    if (aggregate.outputTokens) parts.push(`${copy.outputTokens} ${aggregate.outputTokens}`);
    return parts.join(" · ");
  }

  function apiKeyAggregateLastSeen(aggregate: ProxyLogAPIKeyAggregate): string {
    const time = formatProxyLogTime(String(aggregate.lastStartedAt || ""));
    return time ? copy.apiKeyLastSeen(time) : "";
  }

  function openApiKeyAggregate(aggregate: ProxyLogAPIKeyAggregate) {
    store.proxyLogSelectedId = null;
    store.proxyLogSelectedApiKeyFingerprint = String(aggregate.apiKey?.fingerprint || "").trim() || null;
    store.proxyLogSelectedApiKeyUnidentified = Boolean(aggregate.unidentified);
    store.proxyLogSelectedApiKeyLabel = apiKeyAggregateTitle(aggregate);
    store.proxyLogsOffset = 0;
    void refreshProxyLogs(0);
  }

  function closeApiKeyAggregate() {
    store.proxyLogSelectedId = null;
    store.proxyLogSelectedApiKeyFingerprint = null;
    store.proxyLogSelectedApiKeyUnidentified = false;
    store.proxyLogSelectedApiKeyLabel = "";
    store.proxyLogsOffset = 0;
    void refreshProxyLogs(0);
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
    {#if inApiKeyDetail}
      <Button size="sm" variant="outline" class="w-fit" type="button" onclick={() => closeApiKeyAggregate()}>
        <ArrowLeftIcon class="size-4" />
        {copy.back}
      </Button>
    {/if}

    <SectionCard
      title={inApiKeyDetail ? store.proxyLogSelectedApiKeyLabel || copy.apiKeyUnknown : copy.title}
      description={inApiKeyDetail ? "" : copy.description}
    >
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

      {#if inApiKeyDetail}
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
      {:else if !store.proxyLogApiKeyAggregates.length}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
      {:else}
        {#each store.proxyLogApiKeyAggregates as aggregate, index (`${aggregate.apiKey?.fingerprint || "none"}-${index}`)}
          <ListRow
            title={apiKeyAggregateTitle(aggregate)}
            lines={[apiKeyAggregateSummary(aggregate)]}
            linesNowrap
            centerContent
            onOpen={() => openApiKeyAggregate(aggregate)}
          >
            {#snippet leading()}
              <span class="grid size-7 place-items-center rounded-md bg-muted text-muted-foreground">
                <KeyRoundIcon class="size-4" />
              </span>
            {/snippet}
            {#snippet actions()}
              {#if apiKeyAggregateLastSeen(aggregate)}
                <span class="shrink-0 text-xs text-muted-foreground">
                  {apiKeyAggregateLastSeen(aggregate)}
                </span>
              {/if}
              <ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
            {/snippet}
          </ListRow>
        {/each}
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

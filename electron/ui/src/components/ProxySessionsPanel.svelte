<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { i18n, t } from "../lib/i18n";
  import {
    closeProxySession,
    deleteProxySession,
    openProxyLog,
    openProxySession,
    refreshProxyLogs,
    setActiveTab,
    store,
  } from "../lib/store.svelte";
  import {
    formatProxyLogTime,
    proxyLogSummary,
    tokenUsageCacheRatePercent,
    tokenUsageText,
  } from "../lib/proxy-log-format";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const selectedSession = $derived(
    store.proxyLogSelectedSession
      ? store.proxyLogSessions.find((item) => item.session === store.proxyLogSelectedSession)
      : undefined,
  );
  const inSessionDetail = $derived(Boolean(store.proxyLogSelectedSession));
  let deleteConfirmOpen = $state(false);

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      back: t("common.back"),
      cancel: t("common.cancel"),
      refresh: t("common.refresh"),
      refreshing: t("common.refreshing"),
      sessionsTitle: t("callLogs.sessionsTitle"),
      sessionsDescription: t("callLogs.sessionsDescription"),
      sessionsEmpty: t("callLogs.sessionsEmpty"),
      sessionOverview: t("callLogs.sessionOverview"),
      sessionOverviewDesc: t("callLogs.sessionOverviewDesc"),
      logIds: t("callLogs.logIds"),
      inputTokens: t("callLogs.inputTokens"),
      outputTokens: t("callLogs.outputTokens"),
      totalTokens: t("callLogs.totalTokens"),
      reasoningTokens: t("callLogs.reasoningTokens"),
      toolCalls: t("callLogs.toolCalls"),
      rounds: t("callLogs.rounds"),
      timeSpan: t("callLogs.timeSpan"),
      deleteSession: t("callLogs.deleteSession"),
      deleteConfirmTitle: t("callLogs.deleteSessionConfirmTitle"),
      deleteConfirmDescription: t("callLogs.deleteSessionConfirmDescription"),
      deleteConfirmAction: t("callLogs.deleteSessionConfirmAction"),
    };
  });

  function sessionLine(item: (typeof store.proxyLogSessions)[number]): string {
    const last = item.lastStartedAt ? formatProxyLogTime(item.lastStartedAt) : "";
    const parts = [];
    if (last) parts.push(last);
    parts.push(`${copy.rounds} ${item.entryCount}`);
    return parts.join(" · ");
  }

  function sessionSummaryLine(item: (typeof store.proxyLogSessions)[number]): string {
    const parts = [];
    const usage = item.tokenUsage;
    if (usage?.totalTokens != null) parts.push(`${copy.totalTokens}${usage.totalTokens}`);
    if (usage?.inputTokens != null) parts.push(`${copy.inputTokens}${usage.inputTokens}`);
    if (usage?.outputTokens != null) parts.push(`${copy.outputTokens} ${usage.outputTokens}`);
    const cachePercent = tokenUsageCacheRatePercent(usage);
    if (cachePercent != null) parts.push(t("callLogs.cachePercent", { percent: cachePercent }));
    return parts.join(" · ");
  }

  function sessionMetaLine(item: (typeof store.proxyLogSessions)[number]): string {
    const parts = [`${copy.rounds} ${item.entryCount}`];
    parts.push(`${copy.toolCalls} ${item.toolCallCount || 0}`);
    if (item.tokenUsage?.reasoningTokens != null) parts.push(`${copy.reasoningTokens} ${item.tokenUsage.reasoningTokens}`);
    const span = sessionTimeSpan(item);
    if (span) parts.push(`${copy.timeSpan} ${span}`);
    return parts.join(" · ");
  }

  function sessionTimeSpan(item: (typeof store.proxyLogSessions)[number]): string {
    const first = item.firstStartedAt ? Date.parse(item.firstStartedAt) : NaN;
    const last = item.lastStartedAt ? Date.parse(item.lastStartedAt) : NaN;
    if (!Number.isFinite(first) || !Number.isFinite(last)) return "";
    const seconds = Math.max(0, Math.round((last - first) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    if (minutes < 60) return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  }

  function openSessionLog(logId: string) {
    openProxyLog(logId);
    setActiveTab("call-logs");
  }

  function confirmDeleteSession() {
    const key = store.proxyLogSelectedSession;
    deleteConfirmOpen = false;
    if (!key) return;
    void deleteProxySession(key);
  }

  $effect(() => {
    if (store.proxyLogSelectedSession && !selectedSession) {
      closeProxySession();
    }
  });
</script>

{#if inSessionDetail && selectedSession}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={() => closeProxySession()}>
      <ArrowLeftIcon class="size-4" />
      {copy.back}
    </Button>
    <SectionCard title={copy.sessionOverview} description={copy.sessionOverviewDesc}>
      {#snippet actions()}
        <Button
          size="sm"
          variant="destructive"
          disabled={store.proxyLogsLoading}
          onclick={() => (deleteConfirmOpen = true)}
        >
          {copy.deleteSession}
        </Button>
      {/snippet}
      <div class="space-y-2 px-4 py-3 text-sm">
        <div class="font-medium">{selectedSession.session}</div>
        <div class="text-xs text-muted-foreground">{sessionLine(selectedSession)}</div>
        <div class="text-xs text-muted-foreground">{tokenUsageText(selectedSession.tokenUsage)}</div>
        <div class="text-xs text-muted-foreground">{copy.toolCalls}: {selectedSession.toolCallCount || 0}</div>
      </div>
    </SectionCard>
    <SectionCard title={copy.logIds}>
      {#each selectedSession.logIds as logId (logId)}
        {@const loadedLog = store.proxyLogs.find((entry) => entry.id === logId)}
        <ListRow
          title={logId}
          linesNowrap
          centerContent
          muted={!loadedLog}
          onOpen={loadedLog ? () => openSessionLog(logId) : undefined}
          stopActionsPropagation={false}
        >
          {#snippet actions()}
            {#if loadedLog}
              {@const summary = proxyLogSummary(loadedLog)}
              {#if summary}
                <span class="shrink-0 text-xs text-muted-foreground">
                  {summary}
                </span>
              {/if}
              <ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
            {/if}
          {/snippet}
        </ListRow>
      {/each}
    </SectionCard>

    <Dialog.Root bind:open={deleteConfirmOpen}>
      <Dialog.Content showCloseButton={false} class="sm:max-w-md">
        <div class="flex flex-col gap-4">
          <Dialog.Header>
            <Dialog.Title>{copy.deleteConfirmTitle}</Dialog.Title>
            <Dialog.Description>{copy.deleteConfirmDescription}</Dialog.Description>
          </Dialog.Header>

          <Dialog.Footer class="border-t border-border pt-4">
            <Button type="button" variant="outline" onclick={() => (deleteConfirmOpen = false)}>
              {copy.cancel}
            </Button>
            <Button type="button" variant="destructive" onclick={confirmDeleteSession}>
              {copy.deleteConfirmAction}
            </Button>
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  </div>
{:else}
  <SectionCard title={copy.sessionsTitle} description={copy.sessionsDescription}>
    {#snippet actions()}
      <Button
        size="sm"
        variant="outline"
        disabled={store.proxyLogsLoading}
        onclick={() => void refreshProxyLogs()}
      >
        {store.proxyLogsLoading ? copy.refreshing : copy.refresh}
      </Button>
    {/snippet}

    {#if !store.proxyLogSessions.length}
      <p class="px-4 py-4 text-center text-sm text-muted-foreground">{copy.sessionsEmpty}</p>
    {:else}
      {#each store.proxyLogSessions as item (item.session)}
        <ListRow
          title={item.session}
          lines={[sessionSummaryLine(item), sessionMetaLine(item)].filter(Boolean)}
          linesNowrap
          onOpen={() => openProxySession(item.session)}
          centerContent
          stopActionsPropagation={false}
        >
          {#snippet actions()}
            <ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
          {/snippet}
        </ListRow>
      {/each}
    {/if}
  </SectionCard>
{/if}

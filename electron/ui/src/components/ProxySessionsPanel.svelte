<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { i18n, t } from "../lib/i18n";
  import {
    closeProxySession,
    openProxyLog,
    openProxySession,
    refreshProxyLogs,
    setActiveTab,
    store,
  } from "../lib/store.svelte";
  import { formatProxyLogTime, proxyLogCardTitle, proxyLogSummary } from "../lib/proxy-log-format";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const selectedSession = $derived(
    store.proxyLogSelectedSession
      ? store.proxyLogSessions.find((item) => item.session === store.proxyLogSelectedSession)
      : undefined,
  );
  const inSessionDetail = $derived(Boolean(store.proxyLogSelectedSession));

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      back: t("common.back"),
      refresh: t("common.refresh"),
      refreshing: t("common.refreshing"),
      details: t("common.details"),
      sessionsTitle: t("callLogs.sessionsTitle"),
      sessionsDescription: t("callLogs.sessionsDescription"),
      sessionsEmpty: t("callLogs.sessionsEmpty"),
      sessionOverview: t("callLogs.sessionOverview"),
      sessionOverviewDesc: t("callLogs.sessionOverviewDesc"),
      sessionLogs: t("callLogs.sessionLogs"),
      sessionLogsDesc: t("callLogs.sessionLogsDesc"),
    };
  });

  function sessionLine(item: (typeof store.proxyLogSessions)[number]): string {
    const last = item.lastStartedAt ? formatProxyLogTime(item.lastStartedAt) : "";
    const parts = [`${item.sessionKind} · ${item.entryCount}`];
    if (last) parts.push(last);
    return parts.join(" · ");
  }

  function openSessionLog(logId: string) {
    openProxyLog(logId);
    setActiveTab("call-logs");
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
      <div class="space-y-2 px-4 py-3 text-sm">
        <div class="font-medium">{selectedSession.session}</div>
        <div class="text-xs text-muted-foreground">{sessionLine(selectedSession)}</div>
      </div>
    </SectionCard>
    <SectionCard title={copy.sessionLogs} description={copy.sessionLogsDesc}>
      {#each selectedSession.logIds as logId (logId)}
        {@const loadedLog = store.proxyLogs.find((entry) => entry.id === logId)}
        <ListRow
          title={logId}
          lines={loadedLog ? [proxyLogCardTitle(loadedLog), proxyLogSummary(loadedLog)] : []}
          linesNowrap
          onOpen={loadedLog ? () => openSessionLog(logId) : undefined}
        >
          {#snippet actions()}
            {#if loadedLog}
              <Button size="sm" variant="outline" type="button" onclick={() => openSessionLog(logId)}>
                {copy.details}
                <ChevronRightIcon class="size-4" />
              </Button>
            {/if}
          {/snippet}
        </ListRow>
      {/each}
    </SectionCard>
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
          lines={[sessionLine(item)]}
          linesNowrap
          onOpen={() => openProxySession(item.session)}
        >
          {#snippet actions()}
            <Button size="sm" variant="outline" type="button" onclick={() => openProxySession(item.session)}>
              {copy.details}
              <ChevronRightIcon class="size-4" />
            </Button>
          {/snippet}
        </ListRow>
      {/each}
    {/if}
  </SectionCard>
{/if}

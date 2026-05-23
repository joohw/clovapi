<script lang="ts">
  import type { ProxyLogEntry } from "../global";
  import { i18n, t } from "../lib/i18n";
  import {
    formatProxyLogTime,
    proxyLogBodyText,
    proxyLogOverviewText,
    proxyLogStatusClass,
    proxyLogSummary,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxyLogEntry } = $props();

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      overview: t("callLogs.overview"),
      overviewDesc: t("callLogs.overviewDesc"),
      started: (time: string) => t("callLogs.started", { time }),
      completed: (time: string) => t("callLogs.completed", { time }),
      inboundBody: t("callLogs.inboundBody"),
      inboundBodyDesc: t("callLogs.inboundBodyDesc"),
      upstreamBody: t("callLogs.upstreamBody"),
      upstreamBodyDesc: t("callLogs.upstreamBodyDesc"),
      proxyError: t("callLogs.proxyError"),
      proxyErrorDesc: t("callLogs.proxyErrorDesc"),
    };
  });
</script>

<div class="flex flex-col gap-4">
  <SectionCard title={copy.overview} description={copy.overviewDesc}>
    <div class="space-y-3 px-4 py-3 text-sm">
      <pre
        class="overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
      >{proxyLogOverviewText(entry)}</pre>
      <div class="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs">
        <span class={proxyLogStatusClass(entry.upstream.status)}>{proxyLogSummary(entry)}</span>
        <span class="text-muted-foreground">{copy.started(formatProxyLogTime(entry.startedAt))}</span>
        {#if entry.completedAt}
          <span class="text-muted-foreground">{copy.completed(formatProxyLogTime(entry.completedAt))}</span>
        {/if}
      </div>
    </div>
  </SectionCard>

  <SectionCard title={copy.inboundBody} description={copy.inboundBodyDesc}>
    <pre
      class="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogBodyText(entry.request.body)}</pre>
  </SectionCard>

  <SectionCard title={copy.upstreamBody} description={copy.upstreamBodyDesc}>
    <pre
      class="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogBodyText(entry.upstream.body)}</pre>
  </SectionCard>

  {#if entry.error}
    <SectionCard title={copy.proxyError} description={copy.proxyErrorDesc}>
      <pre
        class="overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-red-600 dark:text-red-400"
      >{entry.error}</pre>
    </SectionCard>
  {/if}
</div>

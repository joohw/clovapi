<script lang="ts">
  import type { ProxyLogEntry } from "../global";
  import { i18n, t } from "../lib/i18n";
  import {
    proxyLogBodyText,
    proxyLogHeaderText,
    proxyLogOverviewText,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxyLogEntry } = $props();

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      overview: t("callLogs.overview"),
      overviewDesc: t("callLogs.overviewDesc"),
      inboundHeaders: t("callLogs.inboundHeaders"),
      inboundHeadersDesc: t("callLogs.inboundHeadersDesc"),
      actualRequestHeaders: t("callLogs.actualRequestHeaders"),
      actualRequestHeadersDesc: t("callLogs.actualRequestHeadersDesc"),
      inboundBody: t("callLogs.inboundBody"),
      inboundBodyDesc: t("callLogs.inboundBodyDesc"),
      upstreamBody: t("callLogs.upstreamBody"),
      upstreamBodyDesc: t("callLogs.upstreamBodyDesc"),
    };
  });
</script>

<div class="flex flex-col gap-4">
  <SectionCard title={copy.overview} description={copy.overviewDesc}>
    <pre
      class="overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogOverviewText(entry)}</pre>
  </SectionCard>

  <SectionCard title={copy.inboundHeaders} description={copy.inboundHeadersDesc}>
    <pre
      class="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogHeaderText(entry.request.headers)}</pre>
  </SectionCard>

  <SectionCard title={copy.actualRequestHeaders} description={copy.actualRequestHeadersDesc}>
    <pre
      class="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogHeaderText(entry.upstream.requestHeaders || {})}</pre>
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
</div>

<script lang="ts">
  import type { ProxySystemLogEntry } from "../global";
  import { i18n, t } from "../lib/i18n";
  import {
    formatProxyLogTime,
    proxyLogBodyText,
    proxySystemLogStreamClass,
    proxySystemLogStreamLabel,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxySystemLogEntry } = $props();

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("systemLogs.title"),
      description: t("systemLogs.description"),
      message: t("systemLogs.message"),
      messageDesc: t("systemLogs.messageDesc"),
    };
  });
</script>

<div class="flex flex-col gap-4">
  <SectionCard title={copy.title} description={copy.description}>
    <div class="space-y-2 px-4 py-3 text-sm">
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span class={proxySystemLogStreamClass(entry.stream)}>{proxySystemLogStreamLabel(entry.stream)}</span>
        <span class="text-muted-foreground">{formatProxyLogTime(entry.at)}</span>
      </div>
    </div>
  </SectionCard>

  <SectionCard title={copy.message} description={copy.messageDesc}>
    <pre
      class="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogBodyText(entry.message)}</pre>
  </SectionCard>
</div>

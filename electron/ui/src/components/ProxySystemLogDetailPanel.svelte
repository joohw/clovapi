<script lang="ts">
  import type { ProxySystemLogEntry } from "../global";
  import { i18n, t } from "../lib/i18n";
  import {
    proxyLogBodyText,
    proxySystemLogStreamClass,
    proxySystemLogSummary,
    proxySystemLogTitle,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxySystemLogEntry } = $props();

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("systemLogs.title"),
      description: t("systemLogs.messageDesc"),
    };
  });
</script>

<div class="flex flex-col gap-4">
  <SectionCard title={copy.title} description={copy.description}>
    <div class="space-y-2 px-4 py-3 text-sm">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span class={proxySystemLogStreamClass(entry.stream)}>{proxySystemLogSummary(entry)}</span>
      </div>
      <pre
        class="max-h-96 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words"
      >{proxyLogBodyText(proxySystemLogTitle(entry))}</pre>
    </div>
  </SectionCard>
</div>

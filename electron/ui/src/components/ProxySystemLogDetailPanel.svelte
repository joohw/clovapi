<script lang="ts">
  import type { ProxySystemLogEntry } from "../global";
  import {
    formatProxyLogTime,
    proxySystemLogStreamClass,
    proxySystemLogStreamLabel,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxySystemLogEntry } = $props();
</script>

<div class="flex flex-col gap-4">
  <SectionCard title="系统日志" description="代理进程与管理器的调试输出。">
    <div class="space-y-2 px-4 py-3 text-sm">
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span class={proxySystemLogStreamClass(entry.stream)}>{proxySystemLogStreamLabel(entry.stream)}</span>
        <span class="text-muted-foreground">{formatProxyLogTime(entry.at)}</span>
      </div>
    </div>
  </SectionCard>

  <SectionCard title="消息内容" description="原始 stdout / stderr 行。">
    <pre
      class="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{entry.message || "(空)"}</pre>
  </SectionCard>
</div>

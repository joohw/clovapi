<script lang="ts">
  import type { ProxyLogEntry } from "../global";
  import {
    formatProxyLogTime,
    proxyLogBodyText,
    proxyLogHeaderText,
    proxyLogStatusClass,
    proxyLogSummary,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxyLogEntry } = $props();
</script>

<div class="flex flex-col gap-4">
  <SectionCard title="请求概览" description="本地代理收到的入站请求与上游响应摘要。">
    <div class="space-y-2 px-4 py-3 text-sm">
      <div class="font-medium break-all">
        {entry.request.method} {entry.request.url}
      </div>
      <div class="break-all text-xs text-muted-foreground">{entry.upstream.url}</div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span class={proxyLogStatusClass(entry.upstream.status)}>{proxyLogSummary(entry)}</span>
        <span class="text-muted-foreground">开始 {formatProxyLogTime(entry.startedAt)}</span>
        {#if entry.completedAt}
          <span class="text-muted-foreground">结束 {formatProxyLogTime(entry.completedAt)}</span>
        {/if}
      </div>
    </div>
  </SectionCard>

  <SectionCard title="入站请求" description="客户端发往本地代理的原始请求。">
    <pre
      class="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{entry.request.method} {entry.request.url}

{proxyLogHeaderText(entry.request.headers)}

{proxyLogBodyText(entry.request.body)}</pre>
  </SectionCard>

  <SectionCard title="上游原始返回" description="代理转发后收到的上游响应片段。">
    <pre
      class="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >HTTP {entry.upstream.status || "(pending)"}
{entry.upstream.method} {entry.upstream.url}

{proxyLogHeaderText(entry.upstream.headers)}

{proxyLogBodyText(entry.upstream.body)}</pre>
  </SectionCard>

  {#if entry.error}
    <SectionCard title="代理错误" description="转发或解析过程中发生的错误。">
      <pre
        class="overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-red-600 dark:text-red-400"
      >{entry.error}</pre>
    </SectionCard>
  {/if}
</div>

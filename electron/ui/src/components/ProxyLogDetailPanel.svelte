<script lang="ts">
  import type { ProxyLogEntry } from "../global";
  import {
    formatProxyLogTime,
    proxyLogBodyText,
    proxyLogOverviewText,
    proxyLogStatusClass,
    proxyLogSummary,
  } from "../lib/proxy-log-format";
  import SectionCard from "./SectionCard.svelte";

  let { entry }: { entry: ProxyLogEntry } = $props();
</script>

<div class="flex flex-col gap-4">
  <SectionCard title="请求概览" description="入站/上游请求行与响应头；Body 见下方。">
    <div class="space-y-3 px-4 py-3 text-sm">
      <pre
        class="overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
      >{proxyLogOverviewText(entry)}</pre>
      <div class="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs">
        <span class={proxyLogStatusClass(entry.upstream.status)}>{proxyLogSummary(entry)}</span>
        <span class="text-muted-foreground">开始 {formatProxyLogTime(entry.startedAt)}</span>
        {#if entry.completedAt}
          <span class="text-muted-foreground">结束 {formatProxyLogTime(entry.completedAt)}</span>
        {/if}
      </div>
    </div>
  </SectionCard>

  <SectionCard title="入站 Body" description="客户端发往本地代理的原始 JSON body。">
    <pre
      class="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogBodyText(entry.request.body)}</pre>
  </SectionCard>

  <SectionCard title="上游返回 Body" description="上游原始响应 body（SSE wire 或 JSON），训练数据后续由 ingress/egress 处理。">
    <pre
      class="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
    >{proxyLogBodyText(entry.upstream.body)}</pre>
  </SectionCard>

  {#if entry.error}
    <SectionCard title="代理错误" description="转发或解析过程中发生的错误。">
      <pre
        class="overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-red-600 dark:text-red-400"
      >{entry.error}</pre>
    </SectionCard>
  {/if}
</div>

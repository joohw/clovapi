<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";
  import type { ModelTestStatus } from "../global";

  let {
    title,
    lines = [],
    showStatusDot = false,
    testStatus = "",
    testSummary = "",
    testDetail = "",
    muted = false,
    indent = false,
    linesNowrap = false,
    onOpen,
    actions,
  }: {
    title: string;
    lines?: string[];
    showStatusDot?: boolean;
    testStatus?: "" | ModelTestStatus;
    testSummary?: string;
    testDetail?: string;
    muted?: boolean;
    indent?: boolean;
    linesNowrap?: boolean;
    onOpen?: () => void;
    actions: Snippet;
  } = $props();

  const dotClass = $derived(
    cn(
      "size-1.5 shrink-0 rounded-full",
      testStatus === "pass" && "bg-emerald-500",
      testStatus === "fail" && "bg-red-500",
      testStatus === "testing" && "animate-pulse bg-amber-500",
      testStatus !== "pass" && testStatus !== "fail" && testStatus !== "testing" && "bg-muted-foreground/40",
    ),
  );

  const summaryClass = $derived(
    cn(
      "shrink-0 text-xs font-normal leading-none",
      testStatus === "pass" && "text-emerald-600 dark:text-emerald-400",
      testStatus === "fail" && "text-red-600 dark:text-red-400",
      testStatus === "testing" && "text-amber-600 dark:text-amber-400",
      testStatus !== "pass" && testStatus !== "fail" && testStatus !== "testing" && "text-muted-foreground",
    ),
  );
</script>

{#snippet titleRow(clickable: boolean)}
  {#if clickable}
    <button
      type="button"
      class="flex w-full min-w-0 items-center gap-2 text-left text-sm font-medium leading-none transition-colors hover:text-primary"
      onclick={onOpen}
    >
      {#if showStatusDot}
        <span class={dotClass} aria-hidden="true"></span>
      {/if}
      <span class="min-w-0 truncate">{title}</span>
      {#if testSummary}
        <span class={summaryClass}>{testSummary}</span>
      {/if}
    </button>
  {:else}
    <div class="flex min-w-0 items-center gap-2 text-sm font-medium leading-none">
      {#if showStatusDot}
        <span class={dotClass} aria-hidden="true"></span>
      {/if}
      <span class="min-w-0 truncate">{title}</span>
      {#if testSummary}
        <span class={summaryClass}>{testSummary}</span>
      {/if}
    </div>
  {/if}
{/snippet}

<div
  class={cn(
    "flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between",
    muted && "bg-muted/30",
    indent && "pl-8",
    testStatus === "testing" && "bg-amber-500/5",
    testStatus === "pass" && "bg-emerald-500/5",
    testStatus === "fail" && "bg-red-500/5",
  )}
>
  <div class="min-w-0 flex-1 space-y-1">
    {#if onOpen}
      {@render titleRow(true)}
    {:else}
      {@render titleRow(false)}
    {/if}
    {#each lines as line (line)}
      <p
        class={cn(
          "text-xs leading-relaxed text-muted-foreground",
          linesNowrap ? "truncate whitespace-nowrap" : "break-all",
        )}
        title={linesNowrap ? line : undefined}
      >
        {line}
      </p>
    {/each}
    {#if testDetail && (testStatus === "pass" || testStatus === "fail")}
      <details class="group text-xs">
        <summary class="cursor-pointer text-muted-foreground hover:text-foreground">查看详情</summary>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <pre
          class="mt-1.5 max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap"
          tabindex="0"
        >{testDetail}</pre>
      </details>
    {/if}
  </div>
  <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
    {@render actions()}
  </div>
</div>

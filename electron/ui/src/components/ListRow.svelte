<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";
  import type { ModelTestStatus } from "../global";

  let {
    title,
    rowTitle = "",
    lines = [],
    showStatusDot = false,
    testStatus = "",
    testSummary = "",
    muted = false,
    indent = false,
    linesNowrap = false,
    centerContent = false,
    inlineActions = false,
    stopActionsPropagation = true,
    titleClass = "",
    class: className = "",
    onOpen,
    onClick,
    onDoubleClick,
    leading,
    actions,
  }: {
    title: string;
    rowTitle?: string;
    lines?: string[];
    showStatusDot?: boolean;
    testStatus?: "" | ModelTestStatus;
    testSummary?: string;
    muted?: boolean;
    indent?: boolean;
    linesNowrap?: boolean;
    centerContent?: boolean;
    inlineActions?: boolean;
    stopActionsPropagation?: boolean;
    titleClass?: string;
    class?: string;
    onOpen?: () => void;
    onClick?: (event: MouseEvent) => void;
    onDoubleClick?: () => void;
    leading?: Snippet;
    actions?: Snippet;
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

  function onRowKeydown(event: KeyboardEvent) {
    if (!onOpen && !onClick) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleRowClick();
  }

  function stopActionClick(event: MouseEvent) {
    if ((!onOpen && !onClick && !onDoubleClick) || !stopActionsPropagation) return;
    event.stopPropagation();
  }

  function stopActionDoubleClick(event: MouseEvent) {
    if ((!onOpen && !onClick && !onDoubleClick) || !stopActionsPropagation) return;
    event.stopPropagation();
  }

  function stopActionKeydown(event: KeyboardEvent) {
    if ((!onOpen && !onClick && !onDoubleClick) || !stopActionsPropagation) return;
    event.stopPropagation();
  }

  function handleRowClick(event: MouseEvent) {
    onClick?.(event);
    onOpen?.();
  }

  const rowClass = $derived(
    cn(
      "flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:justify-between",
      inlineActions && "flex-row items-center justify-between",
      (onOpen || onClick || onDoubleClick) &&
        "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      centerContent ? "sm:items-center" : "sm:items-start",
      muted && "bg-muted/30",
      indent && "pl-8",
      testStatus === "testing" && "bg-amber-500/5",
      testStatus === "pass" && "bg-emerald-500/5",
      testStatus === "fail" && "bg-red-500/5",
      className,
    ),
  );
</script>

{#snippet titleRow()}
  <div class="flex min-w-0 items-center gap-2 text-sm font-medium leading-none">
    {#if showStatusDot}
      <span class={dotClass} aria-hidden="true"></span>
    {/if}
    <span class={cn("min-w-0 truncate", titleClass)}>{title}</span>
    {#if testSummary}
      <span class={summaryClass}>{testSummary}</span>
    {/if}
  </div>
{/snippet}

{#snippet rowContent()}
  <div class="flex min-w-0 flex-1 items-center gap-3">
    {#if leading}
      <div class="shrink-0 self-center">
        {@render leading()}
      </div>
    {/if}
    <div class="min-w-0 flex-1 space-y-1">
      {@render titleRow()}
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
    </div>
  </div>
  {#if actions}
    <div
      class={cn("flex shrink-0 items-center gap-2 sm:justify-end", inlineActions ? "flex-nowrap" : "flex-wrap")}
      role="presentation"
      onclick={stopActionClick}
      ondblclick={stopActionDoubleClick}
      onkeydown={stopActionKeydown}
    >
      {@render actions()}
    </div>
  {/if}
{/snippet}

{#if onOpen || onClick || onDoubleClick}
  <div
    role="button"
    tabindex="0"
    title={rowTitle || undefined}
    onclick={handleRowClick}
    ondblclick={(event) => {
      event.preventDefault();
      onDoubleClick?.();
    }}
    onkeydown={onRowKeydown}
    class={rowClass}
  >
    {@render rowContent()}
  </div>
{:else}
  <div class={rowClass}>
    {@render rowContent()}
  </div>
{/if}

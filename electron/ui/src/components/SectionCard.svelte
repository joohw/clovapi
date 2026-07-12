<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";

  let {
    title,
    description = "",
    fill = false,
    embedded = false,
    headerMeta,
    leading,
    actions,
    children,
  }: {
    title: string;
    description?: string;
    fill?: boolean;
    embedded?: boolean;
    headerMeta?: Snippet;
    leading?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<section
  class={cn(
    "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-none",
    fill && "flex h-full min-h-0 flex-col",
    embedded && "rounded-none border-0 border-b bg-transparent last:border-b-0",
  )}
>
  <header class={cn("shrink-0 p-4", children && "border-b border-border")}>
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-stretch gap-3">
        {#if leading}
          <div class="flex shrink-0 items-center self-stretch">
            {@render leading()}
          </div>
        {/if}
        <div class="min-w-0">
          <h2 class="text-sm font-medium leading-none">{title}</h2>
          {#if description}
            <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          {/if}
          {#if headerMeta}
            <div class="mt-1.5 min-w-0 empty:hidden">
              {@render headerMeta()}
            </div>
          {/if}
        </div>
      </div>
      {#if actions}
        <div class="flex shrink-0 items-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  </header>
  {#if children}
    <div class={cn(fill && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
      {@render children()}
    </div>
  {/if}
</section>

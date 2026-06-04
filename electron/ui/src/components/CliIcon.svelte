<script lang="ts">
  import { cn } from "$lib/utils.js";

  /** Official product favicons bundled from each CLI's website. */
  const ICONS: Record<string, string> = {
    "claude-code": "./agenticons/claude-code.ico",
    claudedesktop: "./agenticons/claude-code.ico",
    codex: "./agenticons/codex.svg",
    opencode: "./agenticons/opencode.svg",
    openclaw: "./agenticons/openclaw.svg",
    hermes: "./agenticons/hermes.ico",
    "kimi-code": "./agenticons/kimi-code.ico",
  };

  let { kind, class: className = "" }: { kind: string; class?: string } = $props();

  const src = $derived(ICONS[kind] || "./agenticons/opencode.svg");
</script>

<img
  {src}
  alt=""
  class={cn(
    "size-10 shrink-0 rounded-lg bg-background object-contain p-1.5 ring-1 ring-border/60",
    className,
  )}
/>

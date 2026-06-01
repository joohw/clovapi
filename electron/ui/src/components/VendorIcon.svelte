<script lang="ts">
  import { cn } from "$lib/utils.js";

  /** Default API/provider icons shown in the API tab. */
  const ICONS: Record<string, string> = {
    "claude-code": "./apiicons/anthropic.svg",
    codex: "./apiicons/chatgpt.svg",
    ollama: "./apiicons/ollama.png",
    "custom-api": "./apiicons/custom-api.svg",
  };

  let { providerId, class: className = "" }: { providerId: string; class?: string } = $props();

  const src = $derived(ICONS[providerId] || ICONS["custom-api"]);
</script>

<img
  {src}
  alt=""
  class={cn(
    "size-10 shrink-0 rounded-lg bg-background object-contain p-1.5 ring-1 ring-border/60",
    className,
  )}
/>

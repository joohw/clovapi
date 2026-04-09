<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let ready = false;

  onMount(() => {
    if (!localStorage.getItem('user')) {
      goto('/', { replaceState: true });
      return;
    }
    ready = true;
  });
</script>

{#if ready}
  <slot />
{:else}
  <div class="page-wrap text-sm text-muted-foreground">加载中…</div>
{/if}

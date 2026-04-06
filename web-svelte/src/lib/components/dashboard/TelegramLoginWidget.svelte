<svelte:options runes={false} />

<script>
  import { onDestroy, onMount } from 'svelte';

  /** @type {string} */
  export let botName = '';
  /** Absolute auth URL (origin + path) */
  export let authUrl = '';

  let container;

  onMount(() => {
    if (!botName || !authUrl || !container) return;
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', botName);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-auth-url', authUrl);
    container.appendChild(s);
  });

  onDestroy(() => {
    if (container) container.innerHTML = '';
  });
</script>

<div bind:this={container} class="flex justify-center py-2"></div>

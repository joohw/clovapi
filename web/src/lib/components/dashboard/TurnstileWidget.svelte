<svelte:options runes={false} />

<script>
  import { onDestroy, onMount } from 'svelte';

  /** @type {string} */
  export let sitekey = '';
  /** @param {string} _token */
  export let onVerify = (_token) => {};

  let container;
  /** @type {string | undefined} */
  let widgetId;
  let loaded = false;

  function loadScript() {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      if (window.turnstile) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Turnstile script load failed'));
      document.head.appendChild(s);
    });
  }

  function renderWidget() {
    // @ts-ignore
    if (!container || !sitekey || !window.turnstile) return;
    // @ts-ignore
    if (widgetId != null) {
      try {
        // @ts-ignore
        window.turnstile.remove(widgetId);
      } catch (_) {}
      widgetId = undefined;
    }
    // @ts-ignore
    widgetId = window.turnstile.render(container, {
      sitekey,
      callback: (token) => onVerify(token),
    });
  }

  $: if (loaded && sitekey && container) {
    renderWidget();
  }

  onMount(async () => {
    try {
      await loadScript();
      loaded = true;
    } catch (_) {
      loaded = false;
    }
  });

  onDestroy(() => {
    // @ts-ignore
    if (widgetId != null && window.turnstile) {
      try {
        // @ts-ignore
        window.turnstile.remove(widgetId);
      } catch (_) {}
    }
  });
</script>

<div bind:this={container} class="flex min-h-[65px] justify-center"></div>

<svelte:options runes={false} />

<script>
  import { toastStore } from '$lib/dashboard/notify.js';
</script>

{#if $toastStore}
  <div
    class="toast-host pointer-events-none fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 px-4"
    role="status"
  >
    <div
      class="pointer-events-auto max-w-md rounded-none border px-4 py-2 text-sm shadow-lg
        {$toastStore.type === 'success'
        ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
        : $toastStore.type === 'error'
          ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
          : $toastStore.type === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
            : 'border-gray-200 bg-white text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'}"
    >
      {$toastStore.message}
    </div>
  </div>
{/if}

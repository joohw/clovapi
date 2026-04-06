<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiGet } from '$lib/api';
  import { isAdmin, setUserData } from '$lib/dashboard/helpers.js';

  let ready = false;

  onMount(async () => {
    if (!localStorage.getItem('user')) {
      goto('/login');
      return;
    }
    try {
      const res = await apiGet('/api/user/self');
      if (res?.success && res.data) {
        localStorage.setItem('user', JSON.stringify(res.data));
        setUserData(res.data);
      }
    } catch (_) {
      // 仍用本地 user 做权限判断
    }
    if (!isAdmin()) {
      goto('/dashboard');
      return;
    }
    ready = true;
  });
</script>

{#if ready}
  <div class="admin-area flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <slot />
  </div>
{:else}
  <div class="page-wrap mt-2 p-8 text-sm text-muted-foreground">校验权限中…</div>
{/if}

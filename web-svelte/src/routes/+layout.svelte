<svelte:options runes={false} />

<script>
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { apiGet } from '$lib/api';
  import { isAdmin } from '$lib/dashboard/helpers.js';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
  } from '$lib/components/ui/dropdown-menu';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import ToastHost from '$lib/components/dashboard/ToastHost.svelte';

  $: pathname = $page.url.pathname;

  /**
   * @param {string} path
   */
  function normalizePath(path) {
    let p = path || '';
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p === '' ? '/' : p;
  }

  /**
   * @param {string} currentPath
   * @param {string} href
   */
  function isNavActive(currentPath, href) {
    const p = normalizePath(currentPath);
    const t = normalizePath(href);
    if (t === '/') return p === '/';
    if (t === '/dashboard') return p === '/dashboard';
    if (t === '/admin') return p === '/admin' || p.startsWith('/admin/');
    return p === t || p.startsWith(t + '/');
  }

  const headerLinksPublic = [
    { text: '模型', to: '/models' },
    { text: '教程', to: '/about' }
  ];

  const headerLinksAuthExtras = [
    { text: '试用', to: '/playground' },
    { text: '密钥', to: '/apikeys' }
  ];

  const headerLinksRest = [...headerLinksPublic, ...headerLinksAuthExtras];

  /** 随路由刷新，登录写入 localStorage 后能切换「首页」/「控制台」 */
  $: hasSession =
    typeof window !== 'undefined' && pathname !== undefined && !!localStorage.getItem('user');

  /** pathname 变化时重新读取 localStorage 中的 role，避免「管理」不显示 */
  $: headerLinks = (() => {
    void pathname;
    if (!hasSession) {
      return [{ text: '首页', to: '/' }, ...headerLinksPublic];
    }
    const dash = [{ text: '控制台', to: '/dashboard' }];
    if (typeof window !== 'undefined' && isAdmin()) {
      dash.push({ text: '管理', to: '/admin' });
    }
    return [...dash, ...headerLinksRest];
  })();

  let username = 'U';

  function refreshAvatarLetter() {
    const raw = localStorage.getItem('user');
    if (!raw) {
      username = 'U';
      return;
    }
    try {
      const user = JSON.parse(raw);
      const name = user?.display_name || user?.username || '';
      username = name ? String(name).slice(0, 1).toUpperCase() : 'U';
    } catch (_) {
      username = 'U';
    }
  }

  onMount(refreshAvatarLetter);

  /** 登录后从 /login 等页返回时同步头像首字母 */
  $: if (typeof window !== 'undefined' && hasSession) {
    void pathname;
    refreshAvatarLetter();
  }

  let showLogoutConfirm = false;

  async function performLogout() {
    showLogoutConfirm = false;
    try {
      await apiGet('/api/user/logout');
    } catch (_) {
      // ignore network/logout response errors
    }
    localStorage.removeItem('user');
    goto('/');
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
  <header class="app-header">
    <nav class="header-nav">
      {#each headerLinks as link}
        <a href={link.to} class="header-nav-link" aria-current={isNavActive(pathname, link.to) ? 'page' : undefined}>
          <Button variant={isNavActive(pathname, link.to) ? 'secondary' : 'ghost'} size="sm" class="header-nav-btn">
            {link.text}
          </Button>
        </a>
      {/each}
    </nav>
    <div class="header-user-area">
      {#if hasSession}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <span class="avatar-btn">{username}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onclick={() => (showLogoutConfirm = true)}>退出登录</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      {:else}
        <a href="/login" class="inline-flex">
          <Button variant="default" size="sm" class="h-9 min-h-9 px-3.5 text-sm rounded-none">
            登录
          </Button>
        </a>
      {/if}
    </div>
  </header>

  <main class="app-main">
    <slot />
  </main>

  <AlertDialog.Root bind:open={showLogoutConfirm}>
    <AlertDialog.Content class="max-w-md">
      <AlertDialog.Header>
        <AlertDialog.Title>确认退出登录</AlertDialog.Title>
        <AlertDialog.Description>退出后需要重新登录，是否继续？</AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer class="gap-2">
        <AlertDialog.Cancel>取消</AlertDialog.Cancel>
        <AlertDialog.Action onclick={performLogout}>退出登录</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>

  <ToastHost />
</div>

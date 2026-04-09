<svelte:options runes={false} />

<script>
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
    { text: '文档', to: '/docs' }
  ];

  const headerLinksAuthExtras = [{ text: '试用', to: '/playground' }];

  const headerLinksRest = [...headerLinksPublic, ...headerLinksAuthExtras];

  /** 随路由刷新，登录写入 localStorage 后显示「控制台」等入口 */
  $: hasSession =
    typeof window !== 'undefined' && pathname !== undefined && !!localStorage.getItem('user');

  /** pathname 变化时重新读取 localStorage 中的 role，避免「管理」不显示 */
  $: headerLinks = (() => {
    void pathname;
    const home = [{ text: '首页', to: '/' }];
    if (!hasSession) {
      return [...home, ...headerLinksPublic];
    }
    const dash = [{ text: '控制台', to: '/dashboard' }];
    if (typeof window !== 'undefined' && isAdmin()) {
      dash.push({ text: '管理', to: '/admin' });
    }
    return [...home, ...dash, ...headerLinksRest];
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
    <div class="app-main-body">
      <slot />
    </div>
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

<style>
  @import 'tailwindcss';
  @import 'tw-animate-css';
  @import 'shadcn-svelte/tailwind.css';
  @import '@fontsource-variable/inter';
  @import '@fontsource/noto-sans-sc/400.css';
  @import '@fontsource/noto-sans-sc/500.css';
  @import '@fontsource/noto-sans-sc/600.css';
  @import '@fontsource/noto-sans-sc/700.css';
  @import '@fontsource-variable/jetbrains-mono';

  @custom-variant dark (&:is(.dark *));

  :global {
    :root {
      color-scheme: light dark;
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.145 0 0);
      --popover: oklch(1 0 0);
      --popover-foreground: oklch(0.145 0 0);
      --primary: oklch(0.205 0 0);
      --primary-foreground: oklch(0.985 0 0);
      --secondary: oklch(0.97 0 0);
      --secondary-foreground: oklch(0.205 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --accent: oklch(0.97 0 0);
      --accent-foreground: oklch(0.205 0 0);
      --destructive: oklch(0.577 0.245 27.325);
      --border: oklch(0.922 0 0);
      --input: oklch(0.922 0 0);
      --ring: oklch(0.708 0 0);
      --chart-1: oklch(0.87 0 0);
      --chart-2: oklch(0.556 0 0);
      --chart-3: oklch(0.439 0 0);
      --chart-4: oklch(0.371 0 0);
      --chart-5: oklch(0.269 0 0);
      --radius: 0;
      --sidebar: oklch(0.985 0 0);
      --sidebar-foreground: oklch(0.145 0 0);
      --sidebar-primary: oklch(0.205 0 0);
      --sidebar-primary-foreground: oklch(0.985 0 0);
      --sidebar-accent: oklch(0.97 0 0);
      --sidebar-accent-foreground: oklch(0.205 0 0);
      --sidebar-border: oklch(0.922 0 0);
      --sidebar-ring: oklch(0.708 0 0);
      --app-header-height: 3.5rem;
      --app-header-float-top: 0.5rem;
      --app-header-float-gap: 0.5rem;
      --app-main-padding-top: calc(
        var(--app-header-float-top) + var(--app-header-height) + var(--app-header-float-gap)
      );
      --app-layout-max-width: 80rem;
      --app-page-pad-x: 2rem;
      --app-content-slot-width: min(
        calc(100vw - 2 * var(--app-page-pad-x)),
        calc(var(--app-layout-max-width) - 2 * var(--app-page-pad-x))
      );
    }

    body {
      @apply h-full min-h-0 overflow-hidden bg-gray-100 text-gray-900 dark:bg-background dark:text-foreground;
    }

    * {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    *::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }

    .app-shell {
      @apply relative flex h-full min-h-0 w-full flex-col;
    }

    .app-shell::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background-color: #f4f4f4;
      background-image:
        linear-gradient(rgba(0, 0, 0, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 0, 0, 0.07) 1px, transparent 1px);
      background-size: 40px 40px;
      background-position: 0 0;
    }

    html.dark .app-shell::before {
      background-color: #000;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
    }

    .app-main-body {
      @apply mx-auto flex w-full max-w-[var(--app-layout-max-width)] min-h-0 min-w-0 flex-1 flex-col;
    }

    .app-header {
      position: fixed;
      top: var(--app-header-float-top);
      left: 50%;
      z-index: 40;
      width: var(--app-content-slot-width);
      transform: translateX(-50%);
      box-sizing: border-box;
      @apply flex h-14 items-center rounded-2xl border border-gray-200/80 bg-white/75 px-4 shadow-md shadow-black/[0.06] backdrop-blur-xl backdrop-saturate-150 md:px-6 dark:border-white/[0.12] dark:bg-black/35 dark:shadow-black/20 dark:backdrop-blur-xl dark:backdrop-saturate-150;
    }

    .header-nav {
      @apply h-full flex flex-1 items-center gap-0.5 md:gap-1 overflow-x-auto whitespace-nowrap min-w-0;
    }

    .header-nav-link {
      @apply inline-flex shrink-0 hover:text-blue-600 transition-colors;
    }

    .header-nav-btn {
      @apply !h-9 min-h-9 px-3.5 text-sm rounded-none;
    }

    .header-user-area {
      @apply relative shrink-0;
    }

    .avatar-btn {
      @apply h-8 w-8 rounded-full bg-gray-200 dark:bg-muted text-sm font-semibold flex items-center justify-center hover:bg-gray-300 dark:hover:bg-muted/80 transition-colors;
    }

    .user-menu {
      @apply absolute right-8 top-11 min-w-32 rounded-none border border-gray-200 dark:border-border bg-white dark:bg-card shadow-lg p-1 flex flex-col z-50;
    }

    .user-menu a,
    .user-menu button {
      @apply text-left text-sm px-3 py-2 rounded-none hover:bg-gray-100 dark:hover:bg-muted;
    }

    .user-menu button {
      @apply text-red-600;
    }

    .app-main {
      position: relative;
      z-index: 1;
      padding-top: var(--app-main-padding-top);
      @apply flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden;
      overflow-y: auto;
    }

    .app-main:has(.playground-page),
    .app-main:has(.models-page) {
      overflow-y: hidden;
    }

    .page-wrap {
      @apply p-8;
    }

    .admin-console-root {
      @apply flex min-h-0 min-w-0 flex-1 flex-col p-8;
    }

    .admin-console-card {
      @apply flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-sm dark:border-zinc-700;
    }

    .admin-console-body {
      @apply flex min-h-0 flex-1 flex-col overflow-hidden p-4 pt-4 md:p-6;
    }

    .admin-console-tab-panel {
      @apply flex min-h-0 flex-1 flex-col;
    }

    .admin-table-wrap {
      @apply min-h-0 flex-1 overflow-auto rounded border border-border;
    }

    .panel {
      @apply rounded-none border border-gray-200 dark:border-border bg-white/70 dark:bg-card/50 overflow-hidden;
    }

    .toolbar {
      @apply flex items-center justify-between gap-2 mb-3;
    }

    .btn-primary {
      @apply h-9 px-4 rounded-none bg-black text-white text-sm hover:opacity-90 disabled:opacity-60;
    }

    .btn-secondary {
      @apply h-9 px-3 rounded-none border border-gray-300 dark:border-input text-sm hover:bg-gray-100 dark:hover:bg-muted;
    }

    .table {
      @apply w-full text-sm;
    }

    .table th {
      @apply text-left px-3 py-2 border-b border-gray-200 dark:border-border font-semibold;
    }

    .table td {
      @apply px-3 py-2 border-b border-gray-100 dark:border-border/60;
    }

    .auth-page {
      @apply flex min-h-full items-center justify-center px-4 py-10;
    }

    .auth-shell {
      @apply mt-0 w-full max-w-md;
    }

    .auth-card {
      @apply rounded-none bg-white/95 dark:bg-card/95 shadow-sm border border-gray-200 dark:border-border;
    }

    .auth-title {
      @apply text-center text-2xl font-semibold py-6;
    }

    .auth-body {
      @apply px-3 pb-8;
    }

    .auth-label {
      @apply block text-sm mb-1 text-gray-700 dark:text-muted-foreground;
    }

    .auth-input {
      @apply w-full min-h-10 rounded-none border border-gray-300 dark:border-input bg-transparent px-3 py-2 outline-none focus:border-blue-500;
    }

    .auth-actions {
      @apply space-y-2 pt-2;
    }

    .dark {
      --background: #111111;
      --foreground: oklch(0.985 0 0);
      --card: #161616;
      --card-foreground: oklch(0.985 0 0);
      --popover: #161616;
      --popover-foreground: oklch(0.985 0 0);
      --primary: oklch(0.922 0 0);
      --primary-foreground: oklch(0.205 0 0);
      --secondary: #1a1a1a;
      --secondary-foreground: oklch(0.985 0 0);
      --muted: #1a1a1a;
      --muted-foreground: oklch(0.708 0 0);
      --accent: #1a1a1a;
      --accent-foreground: oklch(0.985 0 0);
      --destructive: oklch(0.704 0.191 22.216);
      --border: oklch(1 0 0 / 10%);
      --input: oklch(1 0 0 / 15%);
      --ring: oklch(0.556 0 0);
      --chart-1: oklch(0.87 0 0);
      --chart-2: oklch(0.556 0 0);
      --chart-3: oklch(0.439 0 0);
      --chart-4: oklch(0.371 0 0);
      --chart-5: oklch(0.269 0 0);
      --sidebar: #111111;
      --sidebar-foreground: oklch(0.985 0 0);
      --sidebar-primary: oklch(0.488 0.243 264.376);
      --sidebar-primary-foreground: oklch(0.985 0 0);
      --sidebar-accent: #1a1a1a;
      --sidebar-accent-foreground: oklch(0.985 0 0);
      --sidebar-border: oklch(1 0 0 / 10%);
      --sidebar-ring: oklch(0.556 0 0);
    }
  }

  @theme inline {
    --font-sans: 'Inter Variable', 'Noto Sans SC', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'JetBrains Mono Variable', monospace;
    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar: var(--sidebar);
    --color-chart-5: var(--chart-5);
    --color-chart-4: var(--chart-4);
    --color-chart-3: var(--chart-3);
    --color-chart-2: var(--chart-2);
    --color-chart-1: var(--chart-1);
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);
    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
  }

  @layer base {
    :global(*) {
      @apply border-border outline-ring/50;
    }

    :global(html) {
      @apply h-full font-sans antialiased;
    }
  }
</style>

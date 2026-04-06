<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiDelete, apiGet } from '$lib/api';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import {
    onGitHubOAuthClicked,
    onDiscordOAuthClicked,
    onOIDCClicked,
    onLinuxDOOAuthClicked,
    onCustomOAuthClicked,
  } from '$lib/dashboard/oauth.js';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import {
    EnvelopeSimple,
    GithubLogo,
    Shield,
    Key,
    Lock,
    Trash,
  } from 'phosphor-svelte';
  import TwoFASetting from './TwoFASetting.svelte';
  import TelegramLoginWidget from './TelegramLoginWidget.svelte';

  /** @type {{ user?: Record<string, any> } | null} */
  export let userState = { user: null };
  /** @type {Record<string, any>} */
  export let status = {};
  export let systemToken = '';

  /** @type {{ enabled?: boolean; last_used_at?: string | null }} */
  export let passkeyStatus = { enabled: false };
  export let passkeySupported = false;
  export let passkeyRegisterLoading = false;
  export let passkeyDeleteLoading = false;

  export let onGenerateAccessToken = () => {};
  /** @param {MouseEvent} e */
  export let onSystemTokenClick = (e) => {};
  export let onPasskeyRegister = () => {};
  export let onPasskeyDelete = () => {};
  export let onOpenEmailBind = () => {};
  export let onOpenWeChatBind = () => {};
  export let onOpenChangePassword = () => {};
  export let onOpenDeleteAccount = () => {};

  /** @type {'binding' | 'security'} */
  export let section = 'binding';

  let showTelegramModal = false;
  /** @type {any[]} */
  let customOAuthBindings = [];
  /** @type {Record<string, boolean>} */
  let customOAuthLoading = {};

  let showUnbindOAuthDialog = false;
  /** @type {{ providerId: number | string; providerName: string } | null} */
  let unbindOAuthPending = null;

  let showPasskeyUnbindConfirm = false;

  async function loadCustomOAuthBindings() {
    try {
      const res = await apiGet('/api/user/oauth/bindings');
      if (res?.success) {
        customOAuthBindings = res.data || [];
      } else {
        showError(res?.message || '获取绑定信息失败');
      }
    } catch (err) {
      showError(err?.message || '获取绑定信息失败');
    }
  }

  onMount(loadCustomOAuthBindings);

  /**
   * @param {string | undefined} id
   */
  function isBound(id) {
    return Boolean(id);
  }

  /**
   * @param {string} accountId
   * @param {string} [label]
   */
  function accountLine(accountId, label) {
    if (!accountId) return '未绑定';
    return accountId;
  }

  /**
   * @param {number|string} providerId
   */
  function isCustomOAuthBound(providerId) {
    const normalizedId = Number(providerId);
    return customOAuthBindings.some((b) => Number(b.provider_id) === normalizedId);
  }

  /**
   * @param {number|string} providerId
   */
  function getCustomOAuthBinding(providerId) {
    const normalizedId = Number(providerId);
    return customOAuthBindings.find((b) => Number(b.provider_id) === normalizedId);
  }

  /**
   * @param {number|string} providerId
   * @param {string} providerName
   */
  function requestUnbindCustomOAuth(providerId, providerName) {
    unbindOAuthPending = { providerId, providerName };
    showUnbindOAuthDialog = true;
  }

  async function confirmUnbindCustomOAuth() {
    if (!unbindOAuthPending) return;
    const { providerId } = unbindOAuthPending;
    const providerKey = String(providerId);
    customOAuthLoading = { ...customOAuthLoading, [providerKey]: true };
    try {
      const res = await apiDelete(`/api/user/oauth/bindings/${providerId}`);
      if (res?.success) {
        showSuccess('解绑成功');
        await loadCustomOAuthBindings();
      } else {
        showError(res?.message || '操作失败');
      }
    } catch (err) {
      showError(err?.message || '操作失败');
    } finally {
      const next = { ...customOAuthLoading };
      delete next[providerKey];
      customOAuthLoading = next;
      showUnbindOAuthDialog = false;
      unbindOAuthPending = null;
    }
  }

  /**
   * @param {string} icon
   * @param {string} name
   */
  function oauthIcon(icon, name) {
    const raw = String(icon || '').trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return { type: 'img', src: raw, alt: '' };
    }
    if (raw && /[\u{1F300}-\u{1FAFF}]/u.test(raw)) {
      return { type: 'emoji', text: raw };
    }
    return { type: 'letter', text: (name || '?').charAt(0).toUpperCase() };
  }

  $: passkeyEnabled = passkeyStatus?.enabled;
  $: lastUsedLabel = passkeyStatus?.last_used_at
    ? new Date(passkeyStatus.last_used_at).toLocaleString()
    : '尚未使用';
</script>

<div class="w-full min-w-0">
  {#if section === 'binding'}
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- 邮箱 -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <EnvelopeSimple size={20} />
            </div>
            <div class="min-w-0">
              <div class="font-medium">邮箱</div>
              <div class="truncate text-sm text-muted-foreground" title={userState?.user?.email || ''}>
                {accountLine(userState?.user?.email)}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onclick={onOpenEmailBind}>
            {isBound(userState?.user?.email) ? '修改绑定' : '绑定'}
          </Button>
        </div>
      </div>

      <!-- 微信 -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">💬</div>
            <div class="min-w-0">
              <div class="font-medium">微信</div>
              <div class="truncate text-sm text-muted-foreground">
                {#if !status.wechat_login}
                  未启用
                {:else if isBound(userState?.user?.wechat_id)}
                  已绑定
                {:else}
                  未绑定
                {/if}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!status.wechat_login}
            onclick={onOpenWeChatBind}
          >
            {isBound(userState?.user?.wechat_id)
              ? '修改绑定'
              : status.wechat_login
                ? '绑定'
                : '未启用'}
          </Button>
        </div>
      </div>

      <!-- GitHub -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <GithubLogo size={20} />
            </div>
            <div class="min-w-0">
              <div class="font-medium">GitHub</div>
              <div class="truncate text-sm text-muted-foreground" title={userState?.user?.github_id || ''}>
                {accountLine(userState?.user?.github_id)}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isBound(userState?.user?.github_id) || !status.github_oauth}
            onclick={() => onGitHubOAuthClicked(status.github_client_id)}
          >
            {status.github_oauth ? '绑定' : '未启用'}
          </Button>
        </div>
      </div>

      <!-- Discord -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">D</div>
            <div class="min-w-0">
              <div class="font-medium">Discord</div>
              <div class="truncate text-sm text-muted-foreground" title={userState?.user?.discord_id || ''}>
                {accountLine(userState?.user?.discord_id)}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isBound(userState?.user?.discord_id) || !status.discord_oauth}
            onclick={() => onDiscordOAuthClicked(status.discord_client_id)}
          >
            {status.discord_oauth ? '绑定' : '未启用'}
          </Button>
        </div>
      </div>

      <!-- OIDC -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Shield size={20} />
            </div>
            <div class="min-w-0">
              <div class="font-medium">OIDC</div>
              <div class="truncate text-sm text-muted-foreground" title={userState?.user?.oidc_id || ''}>
                {accountLine(userState?.user?.oidc_id)}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isBound(userState?.user?.oidc_id) || !status.oidc_enabled}
            onclick={() => onOIDCClicked(status.oidc_authorization_endpoint, status.oidc_client_id)}
          >
            {status.oidc_enabled ? '绑定' : '未启用'}
          </Button>
        </div>
      </div>

      <!-- Telegram -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">✈</div>
            <div class="min-w-0">
              <div class="font-medium">Telegram</div>
              <div class="truncate text-sm text-muted-foreground" title={userState?.user?.telegram_id || ''}>
                {accountLine(userState?.user?.telegram_id)}
              </div>
            </div>
          </div>
          <div class="shrink-0">
            {#if status.telegram_oauth}
              {#if isBound(userState?.user?.telegram_id)}
                <Button variant="outline" size="sm" disabled>已绑定</Button>
              {:else}
                <Button variant="outline" size="sm" onclick={() => (showTelegramModal = true)}>绑定</Button>
              {/if}
            {:else}
              <Button variant="outline" size="sm" disabled>未启用</Button>
            {/if}
          </div>
        </div>
      </div>

      <!-- LinuxDO -->
      <div class="rounded-xl border border-border p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">L</div>
            <div class="min-w-0">
              <div class="font-medium">LinuxDO</div>
              <div class="truncate text-sm text-muted-foreground" title={userState?.user?.linux_do_id || ''}>
                {accountLine(userState?.user?.linux_do_id)}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isBound(userState?.user?.linux_do_id) || !status.linuxdo_oauth}
            onclick={() => onLinuxDOOAuthClicked(status.linuxdo_client_id)}
          >
            {status.linuxdo_oauth ? '绑定' : '未启用'}
          </Button>
        </div>
      </div>

      {#if status.custom_oauth_providers}
        {#each status.custom_oauth_providers as provider}
          {@const bound = isCustomOAuthBound(provider.id)}
          {@const binding = getCustomOAuthBinding(provider.id)}
          {@const icon = oauthIcon(provider.icon || binding?.provider_icon || '', provider.name)}
          <div class="rounded-xl border border-border p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {#if icon.type === 'img'}
                    <img src={icon.src} alt="" class="h-8 w-8 rounded object-cover" />
                  {:else if icon.type === 'emoji'}
                    <span class="text-lg">{icon.text}</span>
                  {:else}
                    <span class="text-sm font-medium">{icon.text}</span>
                  {/if}
                </div>
                <div class="min-w-0">
                  <div class="font-medium">{provider.name}</div>
                  <div class="truncate text-sm text-muted-foreground">
                    {#if bound}
                      {binding?.provider_user_id || ''}
                    {:else}
                      未绑定
                    {/if}
                  </div>
                </div>
              </div>
              <div class="shrink-0">
                {#if bound}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={customOAuthLoading[String(provider.id)]}
                    onclick={() => requestUnbindCustomOAuth(provider.id, provider.name)}
                  >
                    解绑
                  </Button>
                {:else}
                  <Button variant="outline" size="sm" onclick={() => onCustomOAuthClicked(provider)}>绑定</Button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="space-y-6">
      <div class="rounded-xl border border-border p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Key size={24} />
            </div>
            <div>
              <div class="mb-1 font-semibold">系统访问令牌</div>
              <p class="text-sm text-muted-foreground">用于API调用的身份验证令牌，请妥善保管</p>
              {#if systemToken}
                <input
                  readonly
                  class="auth-input mt-3 w-full max-w-md cursor-pointer font-mono text-xs"
                  value={systemToken}
                  on:click={onSystemTokenClick}
                />
              {/if}
            </div>
          </div>
          <Button variant="secondary" class="self-start" onclick={onGenerateAccessToken}>
            <Key class="mr-1 inline" size={16} />
            {systemToken ? '重新生成' : '生成令牌'}
          </Button>
        </div>
      </div>

      <div class="rounded-xl border border-border p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Lock size={24} />
            </div>
            <div>
              <div class="mb-1 font-semibold">密码管理</div>
              <p class="text-sm text-muted-foreground">定期更改密码可以提高账户安全性</p>
            </div>
          </div>
          <Button variant="secondary" class="self-start" onclick={onOpenChangePassword}>
            <Lock class="mr-1 inline" size={16} />
            修改密码
          </Button>
        </div>
      </div>

      <div class="rounded-xl border border-border p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Key size={24} />
            </div>
            <div>
              <div class="mb-1 font-semibold">Passkey 登录</div>
              <p class="text-sm text-muted-foreground">
                {passkeyEnabled
                  ? '已启用 Passkey，无需密码即可登录'
                  : '使用 Passkey 实现免密且更安全的登录体验'}
              </p>
              <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                <div>最后使用时间：{lastUsedLabel}</div>
                {#if !passkeySupported}
                  <div class="text-amber-600">当前设备不支持 Passkey</div>
                {/if}
              </div>
            </div>
          </div>
          <Button
            variant={passkeyEnabled ? 'destructive' : 'default'}
            class="self-start"
            disabled={
              (!passkeySupported && !passkeyEnabled) ||
              (passkeyEnabled ? passkeyDeleteLoading : passkeyRegisterLoading)
            }
            onclick={() => {
              if (passkeyEnabled) {
                showPasskeyUnbindConfirm = true;
              } else {
                onPasskeyRegister();
              }
            }}
          >
            {(passkeyEnabled ? passkeyDeleteLoading : passkeyRegisterLoading)
              ? '请稍候...'
              : passkeyEnabled
                ? '解绑 Passkey'
                : '注册 Passkey'}
          </Button>
        </div>
      </div>

      <TwoFASetting />

      <div class="rounded-xl border border-border p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Trash size={24} />
            </div>
            <div>
              <div class="mb-1 font-semibold">删除账户</div>
              <p class="text-sm text-muted-foreground">此操作不可逆，所有数据将被永久删除</p>
            </div>
          </div>
          <Button variant="destructive" class="self-start" onclick={onOpenDeleteAccount}>
            <Trash class="mr-1 inline" size={16} />
            删除账户
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<AlertDialog.Root
  bind:open={showUnbindOAuthDialog}
  onOpenChange={(/** @type {boolean} */ open) => {
    if (!open) unbindOAuthPending = null;
  }}
>
  <AlertDialog.Content class="max-w-md">
    <AlertDialog.Header>
      <AlertDialog.Title>确认解绑</AlertDialog.Title>
      <AlertDialog.Description>
        确定要解绑 {unbindOAuthPending?.providerName ?? ''} 吗？
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="gap-2">
      <AlertDialog.Cancel>取消</AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirmUnbindCustomOAuth}>确认</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={showPasskeyUnbindConfirm}>
  <AlertDialog.Content class="max-w-md">
    <AlertDialog.Header>
      <AlertDialog.Title>解绑 Passkey</AlertDialog.Title>
      <AlertDialog.Description>解绑后将无法使用 Passkey 登录，确定要继续吗？</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="gap-2">
      <AlertDialog.Cancel>取消</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive"
        onclick={() => {
          onPasskeyDelete();
          showPasskeyUnbindConfirm = false;
        }}
      >
        解绑
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={showTelegramModal}>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>绑定 Telegram</Dialog.Title>
    </Dialog.Header>
    <p class="text-sm text-muted-foreground">点击下方按钮通过 Telegram 完成绑定</p>
    <div class="scale-95">
      <TelegramLoginWidget
        botName={status.telegram_bot_name}
        authUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/oauth/telegram/bind`}
      />
    </div>
  </Dialog.Content>
</Dialog.Root>

<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiGet, apiPut, apiPost, apiDelete } from '$lib/api';
  import {
    setStatusData,
    setUserData,
    copy,
    quotaToDisplayInputString,
    displayAmountToQuota,
  } from '$lib/dashboard/helpers.js';
  import {
    prepareCredentialCreationOptions,
    buildRegistrationResult,
    isPasskeySupported,
  } from '$lib/dashboard/passkey.js';
  import { showError, showSuccess, showInfo } from '$lib/dashboard/notify.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';
  import UserInfoHeader from '$lib/components/dashboard/UserInfoHeader.svelte';
  import ApiKeysPanel from '$lib/components/dashboard/ApiKeysPanel.svelte';
  import CheckinCalendar from '$lib/components/dashboard/CheckinCalendar.svelte';
  import AccountManagement from '$lib/components/dashboard/AccountManagement.svelte';
  import NotificationSettings from '$lib/components/dashboard/NotificationSettings.svelte';
  import TurnstileWidget from '$lib/components/dashboard/TurnstileWidget.svelte';

  /** @type {{ user?: Record<string, any> } | null} */
  let userState = { user: null };
  /** @type {Record<string, any>} */
  let status = {};

  let inputs = {
    self_account_deletion_confirmation: '',
    original_password: '',
    set_new_password: '',
    set_new_password_confirmation: '',
  };

  let showChangePasswordModal = false;
  let showAccountDeleteModal = false;

  let turnstileEnabled = false;
  let turnstileSiteKey = '';
  let turnstileToken = '';
  let systemToken = '';
  let passkeyStatus = { enabled: false };
  let passkeyRegisterLoading = false;
  let passkeyDeleteLoading = false;
  let passkeySupported = false;

  /** @type {'security' | 'notification' | 'pricing' | 'privacy'} */
  let dashboardTab = 'security';

  let notificationSettings = {
    warningType: 'email',
    warningThreshold: '',
    webhookUrl: '',
    webhookSecret: '',
    notificationEmail: '',
    barkUrl: '',
    gotifyUrl: '',
    gotifyToken: '',
    gotifyPriority: 5,
    upstreamModelUpdateNotifyEnabled: false,
    acceptUnsetModelRatioModel: false,
    recordIpLog: false,
  };

  function applyNotificationFromUserSetting() {
    const raw = userState?.user?.setting;
    if (!raw) return;
    try {
      const settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
      notificationSettings = {
        warningType: settings.notify_type || 'email',
        warningThreshold: quotaToDisplayInputString(
          settings.quota_warning_threshold ?? 500000,
        ),
        webhookUrl: settings.webhook_url || '',
        webhookSecret: settings.webhook_secret || '',
        notificationEmail: settings.notification_email || '',
        barkUrl: settings.bark_url || '',
        gotifyUrl: settings.gotify_url || '',
        gotifyToken: settings.gotify_token || '',
        gotifyPriority: settings.gotify_priority !== undefined ? settings.gotify_priority : 5,
        upstreamModelUpdateNotifyEnabled: settings.upstream_model_update_notify_enabled === true,
        acceptUnsetModelRatioModel: settings.accept_unset_model_ratio_model || false,
        recordIpLog: settings.record_ip_log || false,
      };
    } catch (_) {}
  }

  $: if (userState?.user?.setting) {
    applyNotificationFromUserSetting();
  }

  async function refreshStatus() {
    try {
      const res = await apiGet('/api/status');
      if (res?.success && res.data) {
        status = res.data;
        setStatusData(res.data);
        turnstileEnabled = !!res.data.turnstile_check;
        turnstileSiteKey = res.data.turnstile_site_key || '';
      }
    } catch (_) {}
  }

  onMount(() => {
    const saved = localStorage.getItem('status');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        status = parsed;
        turnstileEnabled = !!parsed.turnstile_check;
        turnstileSiteKey = parsed.turnstile_site_key || '';
      } catch (_) {}
    }
    refreshStatus();
    getUserData();
    isPasskeySupported()
      .then((v) => (passkeySupported = v))
      .catch(() => (passkeySupported = false));
  });

  async function loadPasskeyStatus() {
    try {
      const res = await apiGet('/api/user/passkey');
      if (res?.success) {
        passkeyStatus = {
          enabled: res.data?.enabled || false,
          last_used_at: res.data?.last_used_at || null,
        };
      } else {
        showError(res?.message || '获取 Passkey 状态失败');
      }
    } catch (_) {}
  }

  async function getUserData() {
    const res = await apiGet('/api/user/self');
    if (res?.success) {
      userState = { user: res.data };
      setUserData(res.data);
      await loadPasskeyStatus();
    } else {
      showError(res?.message || '加载失败');
    }
  }

  async function generateAccessToken() {
    const res = await apiGet('/api/user/token');
    if (res?.success) {
      systemToken = res.data;
      await copy(res.data);
      showSuccess('令牌已重置并已复制到剪贴板');
    } else {
      showError(res?.message || '操作失败');
    }
  }

  /**
   * @param {MouseEvent} e
   */
  async function handleSystemTokenClick(e) {
    const t = e.target;
    if (t instanceof HTMLInputElement) {
      t.select();
      await copy(t.value);
      showSuccess('系统令牌已复制到剪切板');
    }
  }

  async function handleRegisterPasskey() {
    if (!passkeySupported || !window.PublicKeyCredential) {
      showInfo('当前设备不支持 Passkey');
      return;
    }
    passkeyRegisterLoading = true;
    try {
      const beginRes = await apiPost('/api/user/passkey/register/begin', {});
      if (!beginRes?.success) {
        showError(beginRes?.message || '无法发起 Passkey 注册');
        return;
      }
      const publicKey = prepareCredentialCreationOptions(
        beginRes.data?.options || beginRes.data?.publicKey || beginRes.data,
      );
      const credential = await navigator.credentials.create({ publicKey });
      const payload = buildRegistrationResult(credential);
      if (!payload) {
        showError('Passkey 注册失败，请重试');
        return;
      }
      const finishRes = await apiPost('/api/user/passkey/register/finish', payload);
      if (finishRes?.success) {
        showSuccess('Passkey 注册成功');
        await loadPasskeyStatus();
      } else {
        showError(finishRes?.message || 'Passkey 注册失败，请重试');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        showInfo('已取消 Passkey 注册');
      } else {
        showError('Passkey 注册失败，请重试');
      }
    } finally {
      passkeyRegisterLoading = false;
    }
  }

  async function handleRemovePasskey() {
    passkeyDeleteLoading = true;
    try {
      const res = await apiDelete('/api/user/passkey');
      if (res?.success) {
        showSuccess('Passkey 已解绑');
        await loadPasskeyStatus();
      } else {
        showError(res?.message || '操作失败，请重试');
      }
    } catch (_) {
      showError('操作失败，请重试');
    } finally {
      passkeyDeleteLoading = false;
    }
  }

  async function deleteAccount() {
    if (inputs.self_account_deletion_confirmation !== userState?.user?.username) {
      showError('请输入你的账户名以确认删除！');
      return;
    }
    const res = await apiDelete('/api/user/self');
    if (res?.success) {
      showSuccess('账户已删除！');
      await apiGet('/api/user/logout');
      localStorage.removeItem('user');
      goto('/');
    } else {
      showError(res?.message || '删除失败');
    }
  }

  async function changePassword() {
    if (!inputs.set_new_password) {
      showError('请输入新密码！');
      return;
    }
    if (inputs.original_password === inputs.set_new_password) {
      showError('新密码需要和原密码不一致！');
      return;
    }
    if (inputs.set_new_password !== inputs.set_new_password_confirmation) {
      showError('两次输入的密码不一致！');
      return;
    }
    const res = await apiPut('/api/user/self', {
      original_password: inputs.original_password,
      password: inputs.set_new_password,
    });
    if (res?.success) {
      showSuccess('密码修改成功！');
    } else {
      showError(res?.message || '修改失败');
    }
    showChangePasswordModal = false;
  }

  async function saveNotificationSettings() {
    try {
      const res = await apiPut('/api/user/setting', {
        notify_type: notificationSettings.warningType,
        quota_warning_threshold: displayAmountToQuota(
          parseFloat(String(notificationSettings.warningThreshold)),
        ),
        webhook_url: notificationSettings.webhookUrl,
        webhook_secret: notificationSettings.webhookSecret,
        notification_email: notificationSettings.notificationEmail,
        bark_url: notificationSettings.barkUrl,
        gotify_url: notificationSettings.gotifyUrl,
        gotify_token: notificationSettings.gotifyToken,
        gotify_priority: (() => {
          const parsed = parseInt(String(notificationSettings.gotifyPriority), 10);
          return Number.isNaN(parsed) ? 5 : parsed;
        })(),
        upstream_model_update_notify_enabled:
          notificationSettings.upstreamModelUpdateNotifyEnabled === true,
        accept_unset_model_ratio_model: notificationSettings.acceptUnsetModelRatioModel,
        record_ip_log: notificationSettings.recordIpLog,
      });
      if (res?.success) {
        showSuccess('设置保存成功');
        await getUserData();
      } else {
        showError(res?.message || '保存失败');
      }
    } catch (_) {
      showError('设置保存失败');
    }
  }
</script>


<div class="page-wrap w-full min-w-0">
  <UserInfoHeader {userState} {status} onRefreshUser={getUserData} />

  {#if status?.checkin_enabled}
    <div class="mt-4 md:mt-6">
      <CheckinCalendar {status} {turnstileEnabled} {turnstileSiteKey} />
    </div>
  {/if}

  <div class="mt-4 w-full min-w-0 md:mt-6">
    <ApiKeysPanel />
  </div>

  <div class="mt-4 w-full min-w-0 md:mt-6">
    <div
      class="w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-neutral-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70"
    >
      <div class="border-b border-border p-4 md:p-6 md:pb-0">
        <div class="flex flex-wrap gap-1 border-b border-border pb-px">
          <button
            type="button"
            class="rounded-none px-3 py-1.5 text-sm {dashboardTab === 'security'
              ? 'border-b-2 border-primary font-medium'
              : 'text-muted-foreground'}"
            onclick={() => (dashboardTab = 'security')}
          >
            安全设置
          </button>
          <button
            type="button"
            class="rounded-none px-3 py-1.5 text-sm {dashboardTab === 'notification'
              ? 'border-b-2 border-primary font-medium'
              : 'text-muted-foreground'}"
            onclick={() => (dashboardTab = 'notification')}
          >
            通知配置
          </button>
          <button
            type="button"
            class="rounded-none px-3 py-1.5 text-sm {dashboardTab === 'pricing'
              ? 'border-b-2 border-primary font-medium'
              : 'text-muted-foreground'}"
            onclick={() => (dashboardTab = 'pricing')}
          >
            价格设置
          </button>
          <button
            type="button"
            class="rounded-none px-3 py-1.5 text-sm {dashboardTab === 'privacy'
              ? 'border-b-2 border-primary font-medium'
              : 'text-muted-foreground'}"
            onclick={() => (dashboardTab = 'privacy')}
          >
            隐私设置
          </button>
        </div>
      </div>
      <div class="p-4 pt-4 md:p-6">
        {#if dashboardTab === 'security'}
          <AccountManagement
            section="security"
            {userState}
            {status}
            {systemToken}
            {passkeyStatus}
            {passkeySupported}
            {passkeyRegisterLoading}
            {passkeyDeleteLoading}
            onGenerateAccessToken={generateAccessToken}
            onSystemTokenClick={handleSystemTokenClick}
            onPasskeyRegister={handleRegisterPasskey}
            onPasskeyDelete={handleRemovePasskey}
            onOpenChangePassword={() => (showChangePasswordModal = true)}
            onOpenDeleteAccount={() => (showAccountDeleteModal = true)}
          />
        {:else}
          <NotificationSettings
            embedded
            panel={dashboardTab}
            bind:notificationSettings
            {status}
            onSaveNotificationSettings={saveNotificationSettings}
          />
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- 删除账户 -->
<Dialog.Root bind:open={showAccountDeleteModal}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>删除账户确认</Dialog.Title>
    </Dialog.Header>
    <div class="space-y-3 py-2">
      <div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        您正在删除自己的帐户，将清空所有数据且不可恢复
      </div>
      <div>
        <label class="auth-label" for="del-confirm">请输入您的用户名以确认删除</label>
        <Input
          id="del-confirm"
          placeholder={`输入你的账户名 ${userState?.user?.username || ''} 以确认删除`}
          bind:value={inputs.self_account_deletion_confirmation}
        />
      </div>
      {#if turnstileEnabled && turnstileSiteKey}
        <TurnstileWidget sitekey={turnstileSiteKey} onVerify={(t) => (turnstileToken = t)} />
      {/if}
    </div>
    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (showAccountDeleteModal = false)}>取消</Button>
      <Button variant="destructive" onclick={deleteAccount}>删除</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- 修改密码 -->
<Dialog.Root bind:open={showChangePasswordModal}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>修改密码</Dialog.Title>
    </Dialog.Header>
    <div class="space-y-3 py-2">
      <div>
        <label class="auth-label" for="pw-old">原密码</label>
        <Input id="pw-old" type="password" bind:value={inputs.original_password} />
      </div>
      <div>
        <label class="auth-label" for="pw-new">新密码</label>
        <Input id="pw-new" type="password" bind:value={inputs.set_new_password} />
      </div>
      <div>
        <label class="auth-label" for="pw-new2">确认新密码</label>
        <Input id="pw-new2" type="password" bind:value={inputs.set_new_password_confirmation} />
      </div>
      {#if turnstileEnabled && turnstileSiteKey}
        <TurnstileWidget sitekey={turnstileSiteKey} onVerify={(t) => (turnstileToken = t)} />
      {/if}
    </div>
    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (showChangePasswordModal = false)}>取消</Button>
      <Button onclick={changePassword}>确定</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

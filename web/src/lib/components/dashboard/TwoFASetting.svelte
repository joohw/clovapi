<svelte:options runes={false} />

<script>
  import { apiGet, apiPost } from '$lib/api';
  import { showError, showSuccess, showWarning } from '$lib/dashboard/notify.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';
  import QRCode from 'qrcode';
  import { onMount } from 'svelte';
  import { Shield, Warning, ArrowsClockwise, Copy } from 'phosphor-svelte';

  let loading = false;
  let status = {
    enabled: false,
    locked: false,
    backup_codes_remaining: 0,
  };

  let setupModalVisible = false;
  let disableModalVisible = false;
  let backupModalVisible = false;

  let setupData = null;
  let verificationCode = '';
  /** @type {string[]} */
  let backupCodes = [];
  let confirmDisable = false;
  let currentStep = 0;
  let qrDataUrl = '';

  async function fetchStatus() {
    try {
      const res = await apiGet('/api/user/2fa/status');
      if (res?.success) {
        status = res.data;
      }
    } catch (_) {
      showError('获取2FA状态失败');
    }
  }

  async function handleSetup2FA() {
    loading = true;
    try {
      const res = await apiPost('/api/user/2fa/setup', {});
      if (res?.success) {
        setupData = res.data;
        currentStep = 0;
        verificationCode = '';
        qrDataUrl = '';
        if (setupData?.qr_code_data) {
          qrDataUrl = await QRCode.toDataURL(setupData.qr_code_data, { width: 180, margin: 1 });
        }
        setupModalVisible = true;
      } else {
        showError(res?.message || '设置失败');
      }
    } catch (_) {
      showError('设置2FA失败');
    } finally {
      loading = false;
    }
  }

  async function handleEnable2FA() {
    if (!verificationCode) {
      showWarning('请输入验证码');
      return;
    }
    loading = true;
    try {
      const res = await apiPost('/api/user/2fa/enable', { code: verificationCode });
      if (res?.success) {
        showSuccess('两步验证启用成功！');
        setupModalVisible = false;
        setupData = null;
        verificationCode = '';
        currentStep = 0;
        await fetchStatus();
      } else {
        showError(res?.message || '启用失败');
      }
    } catch (_) {
      showError('启用2FA失败');
    } finally {
      loading = false;
    }
  }

  async function handleDisable2FA() {
    if (!verificationCode) {
      showWarning('请输入验证码或备用码');
      return;
    }
    if (!confirmDisable) {
      showWarning('请确认您已了解禁用两步验证的后果');
      return;
    }
    loading = true;
    try {
      const res = await apiPost('/api/user/2fa/disable', { code: verificationCode });
      if (res?.success) {
        showSuccess('两步验证已禁用');
        disableModalVisible = false;
        verificationCode = '';
        confirmDisable = false;
        await fetchStatus();
      } else {
        showError(res?.message || '操作失败');
      }
    } catch (_) {
      showError('禁用2FA失败');
    } finally {
      loading = false;
    }
  }

  async function handleRegenerateBackupCodes() {
    if (!verificationCode) {
      showWarning('请输入验证码');
      return;
    }
    loading = true;
    try {
      const res = await apiPost('/api/user/2fa/backup_codes', { code: verificationCode });
      if (res?.success) {
        backupCodes = res.data.backup_codes || [];
        showSuccess('备用码重新生成成功');
        verificationCode = '';
        await fetchStatus();
      } else {
        showError(res?.message || '操作失败');
      }
    } catch (_) {
      showError('重新生成备用码失败');
    } finally {
      loading = false;
    }
  }

  /**
   * @param {string} text
   * @param {string} okMsg
   */
  async function copyText(text, okMsg = '已复制到剪贴板') {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(okMsg);
    } catch (_) {
      showError('复制失败，请手动复制');
    }
  }

  function copyBackupCodes() {
    copyText(backupCodes.join('\n'), '备用码已复制到剪贴板');
  }

  function closeSetup() {
    setupModalVisible = false;
    setupData = null;
    currentStep = 0;
    verificationCode = '';
  }

  onMount(fetchStatus);
</script>

<div class="rounded-xl border border-gray-200 bg-card p-4 dark:border-zinc-700">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex gap-4">
      <div
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Shield size={26} weight="duotone" />
      </div>
      <div>
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <span class="font-semibold">两步验证设置</span>
          {#if status.enabled}
            <span class="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-800 dark:text-green-200"
              >已启用</span
            >
          {:else}
            <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-800 dark:text-red-200">未启用</span>
          {/if}
          {#if status.locked}
            <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-200"
              >账户已锁定</span
            >
          {/if}
        </div>
        <p class="text-sm text-muted-foreground">
          两步验证（2FA）为您的账户提供额外的安全保护。启用后，登录时需要输入密码和验证器应用生成的验证码。
        </p>
        {#if status.enabled}
          <p class="mt-2 text-xs text-muted-foreground">
            剩余备用码：{status.backup_codes_remaining || 0} 个
          </p>
        {/if}
      </div>
    </div>
    <div class="flex w-full flex-col gap-2 sm:w-auto">
      {#if !status.enabled}
        <Button class="w-full sm:w-auto" disabled={loading} onclick={handleSetup2FA}>
          <Shield class="mr-1 inline" size={16} />
          启用验证
        </Button>
      {:else}
        <Button variant="destructive" class="w-full sm:w-auto" onclick={() => (disableModalVisible = true)}>
          <Warning class="mr-1 inline" size={16} />
          禁用两步验证
        </Button>
        <Button variant="outline" class="w-full sm:w-auto" onclick={() => (backupModalVisible = true)}>
          <ArrowsClockwise class="mr-1 inline" size={16} />
          重新生成备用码
        </Button>
      {/if}
    </div>
  </div>
</div>

<Dialog.Root bind:open={setupModalVisible}>
  <Dialog.Content class="max-w-lg max-h-[90vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>设置两步验证</Dialog.Title>
    </Dialog.Header>

    {#if setupData}
      <div class="mb-4 flex gap-2 text-xs">
        {#each ['扫描二维码', '保存备用码', '验证设置'] as label, i}
          <span
            class="rounded-none px-2 py-1 {currentStep === i
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'}"
            >{i + 1}. {label}</span
          >
        {/each}
      </div>

      {#if currentStep === 0}
        <p class="mb-4 text-sm text-muted-foreground">
          使用认证器应用（如 Google Authenticator、Microsoft Authenticator）扫描下方二维码：
        </p>
        {#if qrDataUrl}
          <div class="mb-4 flex justify-center">
            <div class="rounded-lg bg-white p-3 shadow-sm">
              <img src={qrDataUrl} width="180" height="180" alt="2FA QR" />
            </div>
          </div>
        {/if}
        <div class="rounded-lg bg-blue-500/10 p-3 text-sm">
          <span class="text-blue-900 dark:text-blue-100">或手动输入密钥：</span>
          <code class="ml-2 break-all">{setupData.secret}</code>
          <button
            type="button"
            class="ml-2 text-primary underline"
            onclick={() => copyText(setupData.secret, '密钥已复制')}
          >
            复制
          </button>
        </div>
      {:else if currentStep === 1}
        <div class="space-y-3 rounded-xl border p-3">
          <div class="font-semibold">备用恢复代码</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {#each setupData.backup_codes || [] as code, index}
              <div class="rounded-lg bg-muted/50 p-2 font-mono text-sm">
                <div class="flex justify-between">
                  <span>{code}</span>
                  <span class="text-xs text-muted-foreground">#{(index + 1).toString().padStart(2, '0')}</span>
                </div>
              </div>
            {/each}
          </div>
          <Button
            class="w-full"
            variant="secondary"
            onclick={() => copyText((setupData.backup_codes || []).join('\n'), '备用码已复制')}
          >
            <Copy class="mr-1 inline" size={16} />
            复制所有代码
          </Button>
        </div>
      {:else}
        <Input
          placeholder="输入认证器应用显示的6位数字验证码"
          maxlength={6}
          bind:value={verificationCode}
          class="mt-2"
        />
      {/if}

      <Dialog.Footer class="mt-4 flex flex-wrap gap-2">
        {#if currentStep > 0}
          <Button variant="outline" onclick={() => (currentStep -= 1)}>上一步</Button>
        {/if}
        {#if currentStep < 2}
          <Button onclick={() => (currentStep += 1)}>下一步</Button>
        {:else}
          <Button disabled={loading} onclick={handleEnable2FA}>完成设置并启用两步验证</Button>
        {/if}
        <Button variant="ghost" onclick={closeSetup}>关闭</Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={disableModalVisible}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>禁用两步验证</Dialog.Title>
    </Dialog.Header>
    <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      警告：禁用两步验证将永久删除您的验证设置和所有备用码，此操作不可撤销！
    </div>
    <label class="auth-label" for="disable-code">验证身份</label>
    <Input id="disable-code" bind:value={verificationCode} placeholder="请输入认证器验证码或备用码" class="mb-3" />
    <label class="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" bind:checked={confirmDisable} class="mt-1" />
      <span>我已了解禁用两步验证将永久删除所有相关设置和备用码，此操作不可撤销</span>
    </label>
    <Dialog.Footer class="mt-4 gap-2">
      <Button
        variant="outline"
        onclick={() => {
          disableModalVisible = false;
          verificationCode = '';
          confirmDisable = false;
        }}>取消</Button
      >
      <Button variant="destructive" disabled={loading || !confirmDisable || !verificationCode} onclick={handleDisable2FA}
        >确认禁用</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={backupModalVisible}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>重新生成备用码</Dialog.Title>
    </Dialog.Header>

    {#if backupCodes.length === 0}
      <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
        重新生成备用码将使现有的备用码失效，请确保您已保存了当前的备用码。
      </div>
      <label class="auth-label" for="backup-code">验证身份</label>
      <Input id="backup-code" bind:value={verificationCode} placeholder="请输入认证器验证码" />
      <Dialog.Footer class="mt-4 gap-2">
        <Button
          variant="outline"
          onclick={() => {
            backupModalVisible = false;
            verificationCode = '';
            backupCodes = [];
          }}>取消</Button
        >
        <Button disabled={loading || !verificationCode} onclick={handleRegenerateBackupCodes}>生成新的备用码</Button>
      </Dialog.Footer>
    {:else}
      <p class="mb-2 text-sm text-muted-foreground">旧的备用码已失效，请保存新的备用码</p>
      <div class="space-y-2 rounded-xl border p-3">
        {#each backupCodes as code, index}
          <div class="flex justify-between font-mono text-sm">
            <span>{code}</span>
            <span class="text-muted-foreground">#{(index + 1).toString().padStart(2, '0')}</span>
          </div>
        {/each}
      </div>
      <Button class="mt-3 w-full" variant="secondary" onclick={copyBackupCodes}>
        <Copy class="mr-1 inline" size={16} />
        复制所有代码
      </Button>
      <Dialog.Footer class="mt-4">
        <Button
          onclick={() => {
            backupModalVisible = false;
            verificationCode = '';
            backupCodes = [];
          }}>完成</Button
        >
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

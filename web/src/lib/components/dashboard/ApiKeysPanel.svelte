<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiDelete, apiGet, apiPost, apiPut } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Select from '$lib/components/ui/select';
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
  } from '$lib/components/ui/table';
  import {
    renderQuota,
    quotaToUsdInputString,
    usdToQuota,
    copy
  } from '$lib/dashboard/helpers.js';
  import { showSuccess, showError } from '$lib/dashboard/notify.js';

  let loading = true;
  let errorMsg = '';
  /** @type {any[]} */
  let tokens = [];
  let showModal = false;
  let saving = false;
  /** @type {number | null} */
  let editingId = null;

  let showDeleteConfirm = false;
  /** @type {number | null} */
  let pendingDeleteId = null;

  let form = {
    name: '',
    remain_quota: '',
    expired_time: 'never'
  };

  const EXPIRATION_OPTIONS = [
    { value: 'never', label: '永不过期' },
    { value: '1h', label: '1 小时' },
    { value: '1d', label: '1 天' },
    { value: '1m', label: '1 个月' }
  ];

  /** @param {string} v */
  function expirationLabel(v) {
    return EXPIRATION_OPTIONS.find((o) => o.value === v)?.label ?? '永不过期';
  }

  async function loadTokens() {
    loading = true;
    errorMsg = '';
    try {
      const res = await apiGet('/api/token/?p=1&size=100');
      if (res?.success) {
        const data = res.data;
        tokens = Array.isArray(data) ? data : data?.items || [];
      } else {
        errorMsg = res?.message || '加载失败';
      }
    } catch (err) {
      errorMsg = '加载密钥失败';
    } finally {
      loading = false;
    }
  }

  /**
   * @param {number | null | undefined} ts
   */
  function formatDate(ts) {
    if (ts === -1 || !ts) return '不过期';
    const date = new Date(ts * 1000);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function openCreate() {
    editingId = null;
    form = { name: '', remain_quota: '', expired_time: 'never' };
    showModal = true;
  }

  /**
   * @param {any} token
   */
  function openEdit(token) {
    editingId = token.id;
    form = {
      name: token.name || '',
      remain_quota: token.unlimited_quota
        ? ''
        : quotaToUsdInputString(token.remain_quota ?? 0),
      expired_time: toExpirationOption(token.expired_time)
    };
    showModal = true;
  }

  /**
   * @param {number} expiredTime
   */
  function toExpirationOption(expiredTime) {
    if (expiredTime === -1) return 'never';
    const now = Math.floor(Date.now() / 1000);
    const diff = expiredTime - now;
    if (diff <= 3600) return '1h';
    if (diff <= 86400) return '1d';
    return '1m';
  }

  /**
   * @param {string} option
   */
  function buildExpiredTime(option) {
    const now = Math.floor(Date.now() / 1000);
    if (option === '1h') return now + 3600;
    if (option === '1d') return now + 86400;
    if (option === '1m') return now + 30 * 86400;
    return -1;
  }

  /**
   * @param {SubmitEvent} event
   */
  async function submitForm(event) {
    event.preventDefault();
    if (!form.name.trim()) return;

    saving = true;
    try {
      const rawRemain = form.remain_quota;
      const unlimited =
        rawRemain === '' || rawRemain == null || String(rawRemain).trim() === '';
      let remainQuota = 0;
      if (!unlimited) {
        const usd = parseFloat(String(rawRemain));
        if (!Number.isFinite(usd) || usd < 0) {
          errorMsg = '金额无效';
          return;
        }
        remainQuota = usdToQuota(usd);
      }
      /** @type {Record<string, unknown>} */
      const payload = {
        name: form.name.trim(),
        unlimited_quota: unlimited,
        remain_quota: remainQuota,
        expired_time: buildExpiredTime(form.expired_time)
      };

      const res = editingId
        ? await apiPut('/api/token/', { ...payload, id: editingId })
        : await apiPost('/api/token/', payload);

      if (res?.success) {
        showModal = false;
        await loadTokens();
      } else {
        errorMsg = res?.message || '保存失败';
      }
    } catch (err) {
      errorMsg = '保存失败，请稍后重试';
    } finally {
      saving = false;
    }
  }

  /**
   * @param {number} id
   */
  function requestDeleteToken(id) {
    pendingDeleteId = id;
    showDeleteConfirm = true;
  }

  async function confirmDeleteToken() {
    if (pendingDeleteId == null) return;
    const id = pendingDeleteId;
    const res = await apiDelete(`/api/token/${id}/`);
    showDeleteConfirm = false;
    pendingDeleteId = null;
    if (res?.success) {
      await loadTokens();
    } else {
      errorMsg = res?.message || '删除失败';
    }
  }

  /**
   * @param {any} token
   */
  async function toggleStatus(token) {
    const targetStatus = token.status === 1 ? 2 : 1;
    const res = await apiPut('/api/token/?status_only=true', {
      id: token.id,
      status: targetStatus
    });
    if (res?.success) {
      await loadTokens();
    } else {
      errorMsg = res?.message || '更新状态失败';
    }
  }

  /**
   * @param {number} id
   */
  async function copyTokenKey(id) {
    const res = await apiPost(`/api/token/${id}/key`, {});
    if (!res?.success || !res?.data?.key) {
      errorMsg = res?.message || '获取密钥失败';
      return;
    }
    const ok = await copy(`sk-${res.data.key}`);
    if (ok) showSuccess('密钥已复制到剪贴板');
    else showError('复制失败');
  }

  onMount(loadTokens);
</script>

<div
  class="w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-neutral-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70"
>
  <div class="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between md:p-6 md:pb-4">
    <h2 class="text-lg font-semibold tracking-tight">API 密钥</h2>
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onclick={loadTokens} disabled={loading}>
        {loading ? '刷新中...' : '刷新'}
      </Button>
      <Button size="sm" onclick={openCreate}>添加令牌</Button>
    </div>
  </div>

  <div class="p-4 md:p-6 md:pt-4">
    {#if errorMsg}
      <div class="mb-3 text-sm text-red-500">{errorMsg}</div>
    {/if}

    {#if loading}
      <div class="text-sm opacity-70">加载中...</div>
    {:else if tokens.length === 0}
      <div class="text-sm opacity-70">暂无令牌数据</div>
    {:else}
      <div class="overflow-auto">
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>剩余额度</TableHead>
                <TableHead>过期时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each tokens as token}
                <TableRow class={token.status !== 1 ? 'opacity-70' : ''}>
                  <TableCell>{token.id}</TableCell>
                  <TableCell>{token.name || '-'}</TableCell>
                  <TableCell>{token.status === 1 ? '启用' : '禁用'}</TableCell>
                  <TableCell>
                    {token.unlimited_quota ? '无限制' : renderQuota(token.remain_quota ?? 0)}
                  </TableCell>
                  <TableCell>{formatDate(token.expired_time)}</TableCell>
                  <TableCell>
                    <div class="flex flex-wrap gap-1">
                      <Button variant="outline" size="xs" onclick={() => openEdit(token)}>编辑</Button>
                      <Button variant="outline" size="xs" onclick={() => toggleStatus(token)}>
                        {token.status === 1 ? '禁用' : '启用'}
                      </Button>
                      <Button variant="outline" size="xs" onclick={() => copyTokenKey(token.id)}>复制密钥</Button>
                      <Button variant="destructive" size="xs" onclick={() => requestDeleteToken(token.id)}>删除</Button>
                    </div>
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
      </div>
    {/if}
  </div>
</div>

<Dialog.Root bind:open={showModal}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{editingId ? '编辑密钥' : '创建密钥'}</Dialog.Title>
    </Dialog.Header>
    <form class="space-y-3" onsubmit={submitForm}>
      <div>
        <label class="auth-label" for="dash-token-name">名称</label>
        <Input
          id="dash-token-name"
          type="text"
          bind:value={form.name}
          placeholder={'请输入密钥名称，例如「聊天机器人」'}
        />
      </div>
      <div>
        <label class="auth-label" for="dash-token-quota">额度上限（美元，可选）</label>
        <Input
          id="dash-token-quota"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          bind:value={form.remain_quota}
          placeholder="留空表示不限制"
        />
      </div>
      <div>
        <span class="auth-label mb-1 block">过期时间</span>
        <Select.Root type="single" bind:value={form.expired_time}>
          <Select.Trigger id="dash-token-expire" class="w-full min-w-0 max-w-full">
            <span class="truncate text-left">{expirationLabel(form.expired_time)}</span>
          </Select.Trigger>
          <Select.Content>
            {#each EXPIRATION_OPTIONS as opt}
              <Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <Dialog.Footer class="gap-2">
        <Button variant="outline" type="button" onclick={() => (showModal = false)}>取消</Button>
        <Button type="submit" disabled={saving}>{saving ? '保存中...' : editingId ? '保存' : '创建'}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={showDeleteConfirm}>
  <AlertDialog.Content class="max-w-md">
    <AlertDialog.Header>
      <AlertDialog.Title>删除密钥</AlertDialog.Title>
      <AlertDialog.Description>确定删除这个密钥吗？此操作不可恢复。</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="gap-2">
      <AlertDialog.Cancel>取消</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={confirmDeleteToken}>删除</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

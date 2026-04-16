<svelte:options runes={false} />

<script>
  import { Coins, ChartBar, Users, Copy, Gift } from 'phosphor-svelte';
  import { apiGet, apiPost } from '$lib/api';
  import { renderQuota, copy } from '$lib/dashboard/helpers.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';

  /** @type {{ user?: Record<string, any> } | null} */
  export let userState = { user: null };
  /** @type {Record<string, any>} */
  export let status = {};
  /** @type {() => void | Promise<void>} */
  export let onRefreshUser = () => {};

  let showRedeemDialog = false;
  let redemptionCode = '';
  let redeemSubmitting = false;
  let showPayDialog = false;
  let paySubmitting = false;
  let topupCount = 1;
  let minTopup = 1;
  /** @type {Array<{name: string, type: string, min_topup?: number}>} */
  let payMethods = [];
  let selectedPayMethod = '';

  let affLink = '';
  let affLoading = false;
  /** @type {string | number | null} */
  let affFetchedForUser = null;

  $: topUpLink = status?.top_up_link || '';

  async function loadAffLink() {
    if (!userState?.user?.id) return;
    affLoading = true;
    try {
      const res = await apiGet('/api/user/aff');
      if (res?.success && res.data != null && res.data !== '') {
        const code = String(res.data);
        affLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/register?aff=${encodeURIComponent(code)}`;
      } else if (res?.message) {
        showError(res.message);
      }
    } catch (_) {
      showError('获取邀请链接失败');
    } finally {
      affLoading = false;
    }
  }

  $: if (userState?.user?.id != null) {
    const uid = userState.user.id;
    if (affFetchedForUser !== uid) {
      affFetchedForUser = uid;
      loadAffLink();
    }
  }

  async function submitRedeem() {
    if (!redemptionCode?.trim()) {
      showError('请输入兑换码');
      return;
    }
    redeemSubmitting = true;
    try {
      const res = await apiPost('/api/user/topup', { key: redemptionCode.trim() });
      if (res?.success) {
        showSuccess(`兑换成功！获得额度：${renderQuota(res.data)}`);
        redemptionCode = '';
        showRedeemDialog = false;
        await onRefreshUser();
      } else {
        showError(res?.message || '兑换失败');
      }
    } catch (_) {
      showError('请求失败');
    } finally {
      redeemSubmitting = false;
    }
  }

  function openTopUpExternal() {
    void openOnlineTopupDialog();
  }

  async function openOnlineTopupDialog() {
    try {
      const res = await apiGet('/api/user/topup/info');
      if (!res?.success || !res.data) {
        showError(res?.message || '加载充值配置失败');
        return;
      }
      if (!res.data.enable_online_topup) {
        showError('管理员未开启在线充值');
        return;
      }
      let methods = Array.isArray(res.data.pay_methods) ? res.data.pay_methods : [];
      methods = methods.filter((m) => m?.name && m?.type);
      payMethods = methods;
      minTopup = Number(res.data.min_topup) > 0 ? Number(res.data.min_topup) : 1;
      topupCount = minTopup;
      selectedPayMethod = methods[0]?.type || 'alipay';
      showPayDialog = true;
    } catch (_) {
      showError('加载充值配置失败');
    }
  }

  async function submitPay() {
    const amount = Number(topupCount);
    if (!Number.isFinite(amount) || amount < minTopup) {
      showError(`充值数量不能小于 ${minTopup}`);
      return;
    }
    if (!selectedPayMethod) {
      showError('请选择支付方式');
      return;
    }
    paySubmitting = true;
    try {
      const res = await apiPost('/api/user/pay', {
        amount: Math.floor(amount),
        payment_method: selectedPayMethod,
      });
      if (res?.message !== 'success') {
        showError(res?.data || res?.message || '拉起支付失败');
        return;
      }
      const params = res?.data;
      const url = res?.url;
      if (!url || !params || typeof params !== 'object') {
        showError('支付参数无效');
        return;
      }
      const form = document.createElement('form');
      form.action = url;
      form.method = 'POST';
      form.target = '_blank';
      for (const key of Object.keys(params)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(params[key] ?? '');
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
      showPayDialog = false;
    } catch (_) {
      showError('支付请求失败');
    } finally {
      paySubmitting = false;
    }
  }

  async function copyAffLink() {
    if (!affLink) {
      showError('邀请链接未就绪');
      return;
    }
    const ok = await copy(affLink);
    if (ok) showSuccess('邀请链接已复制到剪贴板');
    else showError('复制失败');
  }

</script>

<div class="w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-neutral-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
  <div class="p-4 md:p-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <div class="text-2xl font-bold tracking-wide sm:text-3xl md:text-4xl">
              {renderQuota(userState?.user?.quota)}
            </div>
          </div>
          <Button variant="outline" class="shrink-0" onclick={() => (showRedeemDialog = true)}>
            兑换
          </Button>
          <Button class="shrink-0" onclick={openTopUpExternal}>充值</Button>
        </div>
      </div>
      <div class="hidden shrink-0 lg:block">
        <div class="rounded-xl border border-gray-200 bg-muted/30 px-4 py-3 dark:border-zinc-600">
          <div class="flex items-center gap-4 text-xs text-muted-foreground">
            <div class="flex items-center gap-2">
              <Coins size={16} />
              <span>历史消耗</span>
              <span class="font-semibold text-foreground">{renderQuota(userState?.user?.used_quota)}</span>
            </div>
            <span class="text-border">|</span>
            <div class="flex items-center gap-2">
              <ChartBar size={16} />
              <span>请求次数</span>
              <span class="font-semibold text-foreground">{userState?.user?.request_count ?? 0}</span>
            </div>
            <span class="text-border">|</span>
            <div class="flex items-center gap-2">
              <Users size={16} />
              <span>用户分组</span>
              <span class="font-semibold text-foreground">{userState?.user?.group || '默认'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 邀请奖励 -->
    <div class="mt-4 rounded-xl border border-border bg-muted/20 p-4 dark:bg-muted/10">
      <div class="mb-3 flex items-center gap-2">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
          <Gift size={18} weight="duotone" />
        </div>
        <div>
          <div class="text-sm font-medium">邀请奖励</div>
          <div class="text-xs text-muted-foreground">邀请好友注册，对方充值后奖励将直接到账户余额</div>
        </div>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          readonly
          class="flex-1 font-mono text-xs"
          value={affLoading ? '加载中…' : affLink || '—'}
        />
        <div class="flex shrink-0 flex-wrap gap-2 sm:h-8 sm:items-center">
          <Button variant="outline" class="h-8 gap-1.5" onclick={copyAffLink} disabled={affLoading || !affLink}>
            <Copy size={16} />
            复制链接
          </Button>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div class="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
          <div class="mb-0.5 flex items-center gap-1 text-muted-foreground">
            <Users size={14} />
            邀请人数
          </div>
          <div class="font-semibold tabular-nums">{userState?.user?.aff_count ?? 0}</div>
        </div>
        <div class="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
          <div class="mb-0.5 flex items-center gap-1 text-muted-foreground">
            <ChartBar size={14} />
            累计收益
          </div>
          <div class="font-semibold tabular-nums">
            {renderQuota(userState?.user?.aff_history_quota ?? 0)}
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 lg:hidden">
      <div class="rounded-xl border border-gray-200 bg-muted/30 p-3 dark:border-zinc-600">
        <div class="space-y-3 text-sm">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-muted-foreground">
              <Coins size={16} />
              <span>历史消耗</span>
            </div>
            <span class="font-semibold">{renderQuota(userState?.user?.used_quota)}</span>
          </div>
          <div class="border-t border-dashed border-border"></div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-muted-foreground">
              <ChartBar size={16} />
              <span>请求次数</span>
            </div>
            <span class="font-semibold">{userState?.user?.request_count ?? 0}</span>
          </div>
          <div class="border-t border-dashed border-border"></div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-muted-foreground">
              <Users size={16} />
              <span>用户分组</span>
            </div>
            <span class="font-semibold">{userState?.user?.group || '默认'}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- 兑换码 -->
<Dialog.Root bind:open={showRedeemDialog}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>兑换</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        输入兑换码将额度充入当前账户。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 py-2">
      <div>
        <label class="auth-label" for="redeem-code">兑换码</label>
        <Input id="redeem-code" bind:value={redemptionCode} placeholder="输入兑换码" />
      </div>
    </div>
    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (showRedeemDialog = false)}>取消</Button>
      <Button disabled={redeemSubmitting} onclick={submitRedeem}>
        {redeemSubmitting ? '提交中…' : '确认兑换'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- 在线充值 -->
<Dialog.Root bind:open={showPayDialog}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>在线充值</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        请输入充值金额（USD）并选择支付方式。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 py-2">
      <div>
        <label class="auth-label" for="topup-count">充值金额（USD）</label>
        <Input
          id="topup-count"
          type="number"
          bind:value={topupCount}
          min={minTopup}
          step={1}
          placeholder={`最小 ${minTopup} USD`}
          class="font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <p class="mt-1 text-xs text-muted-foreground">按美元金额填写（USD）。</p>
      </div>
      <div>
        <div class="auth-label">支付方式</div>
        <div class="flex flex-wrap gap-2">
          {#if payMethods.length > 0}
            {#each payMethods as m}
              <Button
                type="button"
                size="sm"
                variant={selectedPayMethod === m.type ? 'default' : 'outline'}
                onclick={() => (selectedPayMethod = m.type)}
              >
                {m.name}
              </Button>
            {/each}
          {:else}
            <span class="text-xs text-muted-foreground">暂无可用支付方式</span>
          {/if}
        </div>
      </div>
    </div>
    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (showPayDialog = false)}>取消</Button>
      <Button disabled={paySubmitting || payMethods.length === 0} onclick={submitPay}>
        {paySubmitting ? '拉起中…' : '确认支付'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

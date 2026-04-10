<svelte:options runes={false} />

<script>
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { apiGet, apiPut } from '$lib/api';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';

  /** 为 true 时加载（由父级 tab 控制） */
  export let active = false;

  let loading = false;
  let saving = false;
  let loadSeq = 0;
  let errorMsg = '';

  /** @type {Record<string, string>} */
  let form = {
    MinTopUp: '',
    InviterTopupRewardRatio: '',
    PayAddress: '',
    CustomCallbackAddress: '',
    EpayId: '',
    EpayKey: '',
  };
  const DEFAULT_EPAY_PAY_METHODS = JSON.stringify([
    { name: '支付宝', color: 'rgba(var(--semi-blue-5), 1)', type: 'alipay' },
    { name: '微信', color: 'rgba(var(--semi-green-5), 1)', type: 'wxpay' },
  ]);


  /** @type {Record<string, string>} */
  let snapshot = { ...form };

  /**
   * @param {any[]} rows
   * @param {string} key
   */
  function pick(rows, key) {
    const row = rows.find((r) => r?.key === key);
    return row?.value != null ? String(row.value) : '';
  }

  async function loadData() {
    const seq = ++loadSeq;
    loading = true;
    errorMsg = '';
    try {
      const res = await apiGet('/api/option/');
      if (seq !== loadSeq) return;
      if (!res?.success) {
        errorMsg = res?.message || '加载失败（需超级管理员）';
        return;
      }
      const rows = Array.isArray(res.data) ? res.data : [];
      form = {
        MinTopUp: pick(rows, 'MinTopUp'),
        InviterTopupRewardRatio: pick(rows, 'InviterTopupRewardRatio'),
        PayAddress: pick(rows, 'PayAddress'),
        CustomCallbackAddress: pick(rows, 'CustomCallbackAddress'),
        EpayId: pick(rows, 'EpayId'),
        EpayKey: '',
      };
      snapshot = { ...form };
    } catch (_) {
      if (seq === loadSeq) errorMsg = '网络错误';
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $: if (active) {
    void loadData();
  }

  async function saveAll() {
    const changedKeys = Object.keys(form).filter((k) => {
      if (k === 'EpayKey') {
        return String(form.EpayKey || '').trim() !== '';
      }
      return String(form[k] ?? '') !== String(snapshot[k] ?? '');
    });
    // 始终将支付方式固定为易支付默认（支付宝/微信）
    const changedOptionKeys = [...changedKeys, 'PayMethods'];
    if (changedKeys.length === 0) {
      changedOptionKeys.length = 1;
      changedOptionKeys[0] = 'PayMethods';
    }
    saving = true;
    try {
      for (const key of changedOptionKeys) {
        const res = await apiPut('/api/option/', {
          key,
          value: key === 'PayMethods' ? DEFAULT_EPAY_PAY_METHODS : String(form[key] ?? ''),
        });
        if (!res?.success) {
          throw new Error(res?.message || `${key} 保存失败`);
        }
      }
      snapshot = { ...form };
      form.EpayKey = '';
      showSuccess('易支付配置已保存');
    } catch (e) {
      showError(e?.message || '保存失败');
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
  <p class="shrink-0 text-xs text-muted-foreground">
    已简化为易支付专用配置。系统默认支付方式固定为支付宝/微信（易支付），无需再单独配置其他支付渠道。
  </p>

  <div class="flex shrink-0 flex-wrap items-center gap-2">
    <Button variant="outline" size="sm" class="h-8 text-xs" disabled={loading || saving} onclick={loadData}>
      刷新
    </Button>
    <Button size="sm" class="h-8 text-xs" disabled={loading || saving} onclick={saveAll}>
      {saving ? '保存中…' : '保存充值设置'}
    </Button>
  </div>

  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-2xl border border-border bg-neutral-50 p-4 shadow-sm dark:bg-zinc-950/70"
  >
    {#if loading}
      <div class="text-sm text-muted-foreground">加载中…</div>
    {:else if errorMsg}
      <div class="text-sm text-destructive">{errorMsg}</div>
    {:else}
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label class="auth-label" for="topup-min">MinTopUp（最小充值）</label>
          <Input id="topup-min" bind:value={form.MinTopUp} placeholder="例如 1" />
        </div>
        <div>
          <label class="auth-label" for="topup-invite-ratio">InviterTopupRewardRatio（邀请返佣比例）</label>
          <Input id="topup-invite-ratio" bind:value={form.InviterTopupRewardRatio} placeholder="例如 0.1 表示 10%" />
        </div>
        <div class="md:col-span-2">
          <label class="auth-label" for="topup-pay-address">PayAddress（支付服务地址）</label>
          <Input id="topup-pay-address" bind:value={form.PayAddress} placeholder="https://pay.example.com" />
        </div>
        <div>
          <label class="auth-label" for="topup-epay-id">EpayId（商户ID）</label>
          <Input id="topup-epay-id" bind:value={form.EpayId} placeholder="商户ID" />
        </div>
        <div>
          <label class="auth-label" for="topup-epay-key">EpayKey（商户密钥，仅写入）</label>
          <Input id="topup-epay-key" bind:value={form.EpayKey} placeholder="留空则不修改" />
        </div>
        <div class="md:col-span-2">
          <label class="auth-label" for="topup-callback">CustomCallbackAddress（可选）</label>
          <Input id="topup-callback" bind:value={form.CustomCallbackAddress} placeholder="https://your-public-domain.com" />
        </div>
      </div>
    {/if}
  </div>
</div>

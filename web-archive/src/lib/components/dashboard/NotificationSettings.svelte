<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet, apiPut } from '$lib/api';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import {
    displayAmountToQuota,
    getQuotaThresholdUnitLabel,
  } from '$lib/dashboard/helpers.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Bell, CurrencyDollar, ShieldCheck } from 'phosphor-svelte';

  /** @type {Record<string, any>} */
  export let notificationSettings = {};
  export let onSaveNotificationSettings = () => {};

  /** @type {Record<string, any>} */
  export let status = {};

  /** 嵌入控制台统一 Tab 时去掉外层标题与卡片描边 */
  export let embedded = false;

  /** 嵌入时由父级指定当前面板；非嵌入时由内层 Tab 切换 */
  /** @type {'notification' | 'pricing' | 'privacy'} */
  export let panel = 'notification';

  let activeTab = 'notification';
  $: currentView = embedded ? panel : activeTab;
  /** @type {Record<string, any> | null} */
  let permissions = null;

  const isAdminOrRoot = () => (permissions?.user?.role ?? 0) >= 10;

  /** @type {string} */
  let thresholdUnitLabel = '美元';
  $: {
    void status;
    thresholdUnitLabel = getQuotaThresholdUnitLabel();
  }

  async function loadPermissions() {
    const res = await apiGet('/api/user/self');
    if (res?.success) {
      permissions = { ...(res.data.permissions || {}), user: res.data };
    }
  }

  onMount(() => {
    loadPermissions();
  });

  function validateAndSave() {
    const w = notificationSettings.warningType;
    if (w === 'webhook') {
      const u = notificationSettings.webhookUrl || '';
      if (!u.startsWith('https://')) {
        showError('Webhook 地址必须以 https:// 开头');
        return;
      }
    }
    if (w === 'bark') {
      const u = notificationSettings.barkUrl || '';
      if (!/^https?:\/\//.test(u)) {
        showError('Bark 推送 URL 格式不正确');
        return;
      }
    }
    if (w === 'gotify') {
      const u = notificationSettings.gotifyUrl || '';
      if (!/^https?:\/\//.test(u)) {
        showError('Gotify 地址格式不正确');
        return;
      }
      if (!(notificationSettings.gotifyToken || '').trim()) {
        showError('请输入 Gotify 应用令牌');
        return;
      }
    }
    const th = parseFloat(String(notificationSettings.warningThreshold));
    if (!Number.isFinite(th) || th <= 0) {
      showError('预警阈值必须为正数');
      return;
    }
    if (displayAmountToQuota(th) <= 0) {
      showError('预警阈值过小或无效');
      return;
    }
    onSaveNotificationSettings();
  }
</script>

<div
  class="w-full min-w-0 overflow-hidden {embedded
    ? ''
    : 'rounded-2xl border border-gray-200 bg-neutral-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70'}"
>
  {#if !embedded}
    <div class="flex flex-col gap-4 border-b border-border p-4 md:p-6">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-300">
          <Bell size={18} weight="duotone" />
        </div>
        <div>
          <div class="text-lg font-medium">其他设置</div>
          <div class="text-xs text-muted-foreground">通知、价格和隐私相关设置</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-1 border-b border-border pb-px">
        <button
          type="button"
          class="rounded-none px-3 py-1.5 text-sm {activeTab === 'notification'
            ? 'border-b-2 border-primary font-medium'
            : 'text-muted-foreground'}"
          on:click={() => (activeTab = 'notification')}
        >
          <span class="inline-flex items-center gap-1"><Bell size={14} /> 通知配置</span>
        </button>
        <button
          type="button"
          class="rounded-none px-3 py-1.5 text-sm {activeTab === 'pricing'
            ? 'border-b-2 border-primary font-medium'
            : 'text-muted-foreground'}"
          on:click={() => (activeTab = 'pricing')}
        >
          <span class="inline-flex items-center gap-1"><CurrencyDollar size={14} /> 价格设置</span>
        </button>
        <button
          type="button"
          class="rounded-none px-3 py-1.5 text-sm {activeTab === 'privacy'
            ? 'border-b-2 border-primary font-medium'
            : 'text-muted-foreground'}"
          on:click={() => (activeTab = 'privacy')}
        >
          <span class="inline-flex items-center gap-1"><ShieldCheck size={14} /> 隐私设置</span>
        </button>
      </div>
    </div>
  {/if}

  <div class="{embedded ? '' : 'p-4 md:p-6'}">
    {#if currentView === 'notification'}
      <div class="space-y-4">
        <div>
          <div class="auth-label mb-2">通知方式</div>
          <div class="flex flex-wrap gap-3 text-sm">
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" bind:group={notificationSettings.warningType} value="email" />
              邮件通知
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" bind:group={notificationSettings.warningType} value="webhook" />
              Webhook
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" bind:group={notificationSettings.warningType} value="bark" />
              Bark
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" bind:group={notificationSettings.warningType} value="gotify" />
              Gotify
            </label>
          </div>
        </div>

        <div>
          <label class="auth-label" for="warn-th">额度预警阈值（{thresholdUnitLabel}）</label>
          <Input
            id="warn-th"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            bind:value={notificationSettings.warningThreshold}
            placeholder="请输入阈值"
          />
          <p class="mt-1 text-xs text-muted-foreground">低于该阈值时按所选方式通知</p>
        </div>

        {#if isAdminOrRoot()}
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              bind:checked={notificationSettings.upstreamModelUpdateNotifyEnabled}
            />
            <span>
              <span class="font-medium">接收上游模型更新通知</span>
              <span class="block text-xs text-muted-foreground">
                仅管理员可用。开启后，当系统定时检测全部渠道发现上游模型变更或检测异常时，将按你选择的通知方式发送汇总通知。
              </span>
            </span>
          </label>
        {/if}

        {#if notificationSettings.warningType === 'email'}
          <div>
            <label class="auth-label" for="notif-email">通知邮箱</label>
            <Input
              id="notif-email"
              type="email"
              bind:value={notificationSettings.notificationEmail}
              placeholder="留空则使用账号绑定的邮箱"
            />
          </div>
        {/if}

        {#if notificationSettings.warningType === 'webhook'}
          <div>
            <label class="auth-label" for="wh-url">Webhook 地址</label>
            <Input id="wh-url" bind:value={notificationSettings.webhookUrl} placeholder="https://..." />
          </div>
          <div>
            <label class="auth-label" for="wh-sec">接口凭证</label>
            <Input id="wh-sec" bind:value={notificationSettings.webhookSecret} placeholder="可选" />
          </div>
          <div class="rounded border border-border bg-muted/30 p-3 dark:border-zinc-600">
            <div class="mb-2 text-xs font-medium">Webhook 请求示例 (JSON)</div>
            <pre
              class="max-h-40 overflow-auto rounded bg-background p-2 text-[10px] leading-relaxed"
            ><code>{JSON.stringify(
                {
                  type: 'quota_exceed',
                  title: '额度预警通知',
                  content: '您的额度即将用尽，当前剩余额度为 {{value}}',
                  values: ['$0.99'],
                  timestamp: 1739950503,
                },
                null,
                2,
              )}</code></pre>
          </div>
        {/if}

        {#if notificationSettings.warningType === 'bark'}
          <div>
            <label class="auth-label" for="bark-url">Bark 推送 URL</label>
            <Input id="bark-url" bind:value={notificationSettings.barkUrl} placeholder="https://api.day.app/..." />
          </div>
          <p class="text-xs text-muted-foreground">
            模板变量：{'{{title}}'}、{'{{content}}'}。更多参数见 Bark 文档。
          </p>
        {/if}

        {#if notificationSettings.warningType === 'gotify'}
          <div>
            <label class="auth-label" for="gotify-url">Gotify 服务器地址</label>
            <Input id="gotify-url" bind:value={notificationSettings.gotifyUrl} placeholder="https://..." />
          </div>
          <div>
            <label class="auth-label" for="gotify-tok">Gotify 应用令牌</label>
            <Input id="gotify-tok" bind:value={notificationSettings.gotifyToken} />
          </div>
          <div>
            <label class="auth-label" for="gotify-pri">消息优先级 (0-10)</label>
            <Input
              id="gotify-pri"
              type="number"
              bind:value={notificationSettings.gotifyPriority}
              min="0"
              max="10"
            />
          </div>
        {/if}
      </div>
    {:else if currentView === 'pricing'}
      <label class="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" bind:checked={notificationSettings.acceptUnsetModelRatioModel} />
        <span>
          <span class="font-medium">接受未设置价格模型</span>
          <span class="block text-xs text-muted-foreground">
            当模型没有设置价格时仍接受调用，仅当您信任该网站时使用，可能会产生高额费用
          </span>
        </span>
      </label>
    {:else if currentView === 'privacy'}
      <label class="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" bind:checked={notificationSettings.recordIpLog} />
        <span>
          <span class="font-medium">记录请求与错误日志 IP</span>
          <span class="block text-xs text-muted-foreground">
            开启后，仅「消费」和「错误」日志将记录您的客户端 IP 地址
          </span>
        </span>
      </label>
    {/if}
  </div>

  <div class="flex justify-end gap-2 border-t border-border border-dashed px-4 py-3 md:px-6">
    <Button onclick={validateAndSave}>保存设置</Button>
  </div>
</div>

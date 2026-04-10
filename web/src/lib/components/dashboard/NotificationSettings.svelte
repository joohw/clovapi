<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet, apiPut } from '$lib/api';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import {
    displayAmountToQuota,
    getQuotaThresholdUnitLabel,
  } from '$lib/dashboard/helpers.js';
  import { mergeAdminConfig, DEFAULT_ADMIN_CONFIG } from '$lib/dashboard/sidebar-config.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Bell, CurrencyDollar, ShieldCheck, GearSix } from 'phosphor-svelte';

  /** @type {Record<string, any>} */
  export let notificationSettings = {};
  export let onSaveNotificationSettings = () => {};

  /** @type {Record<string, any>} */
  export let status = {};

  /** 嵌入控制台统一 Tab 时去掉外层标题与卡片描边 */
  export let embedded = false;

  /** 嵌入时由父级指定当前面板；非嵌入时由内层 Tab 切换 */
  /** @type {'notification' | 'pricing' | 'privacy' | 'sidebar'} */
  export let panel = 'notification';

  let activeTab = 'notification';
  $: currentView = embedded ? panel : activeTab;
  let sidebarLoading = false;
  /** @type {Record<string, any> | null} */
  let permissions = null;
  /** @type {Record<string, any>} */
  let sidebarModulesUser = {
    chat: { enabled: true, playground: true, chat: true },
    console: {
      enabled: true,
      detail: true,
      token: true,
      log: true,
      midjourney: true,
      task: true,
    },
    personal: { enabled: true, topup: true, personal: true },
    admin: {
      enabled: true,
      channel: true,
      models: true,
      subscription: true,
      redemption: true,
      user: true,
      setting: true,
    },
  };
  /** @type {Record<string, any> | null} */
  let adminConfig = null;

  const isAdminOrRoot = () => (permissions?.user?.role ?? 0) >= 10;
  let prevSidebarAdmin = '';

  /** @type {string} */
  let thresholdUnitLabel = '美元';
  $: {
    void status;
    thresholdUnitLabel = getQuotaThresholdUnitLabel();
  }

  function hasSidebarSettingsPermission() {
    return permissions?.sidebar_settings === true;
  }

  function isSidebarSectionAllowed(sectionKey) {
    if (!permissions?.sidebar_modules) return true;
    return permissions.sidebar_modules[sectionKey] !== false;
  }

  function isSidebarModuleAllowed(sectionKey, moduleKey) {
    if (!permissions?.sidebar_modules) return true;
    const sectionPerms = permissions.sidebar_modules[sectionKey];
    if (sectionPerms === false) return false;
    if (sectionPerms && sectionPerms[moduleKey] === false) return false;
    return true;
  }

  function isAllowedByAdmin(sectionKey, moduleKey = null) {
    if (!adminConfig) return true;
    if (moduleKey) {
      return adminConfig[sectionKey]?.enabled && adminConfig[sectionKey]?.[moduleKey];
    }
    return adminConfig[sectionKey]?.enabled;
  }

  const sectionConfigsBase = [
    {
      key: 'chat',
      title: '聊天区域',
      description: '操练场和聊天功能',
      modules: [
        { key: 'playground', title: '操练场', description: 'AI模型测试环境' },
        { key: 'chat', title: '聊天', description: '聊天会话管理' },
      ],
    },
    {
      key: 'console',
      title: '控制台区域',
      description: '数据管理和日志查看',
      modules: [
        { key: 'detail', title: '数据看板', description: '系统数据统计' },
        { key: 'token', title: 'ApiKeys', description: 'API Keys 管理' },
        { key: 'log', title: '使用日志', description: 'API使用记录' },
        { key: 'midjourney', title: '绘图日志', description: '绘图任务记录' },
        { key: 'task', title: '任务日志', description: '系统任务记录' },
      ],
    },
    {
      key: 'personal',
      title: '个人中心区域',
      description: '用户个人功能',
      modules: [
        { key: 'topup', title: '钱包管理', description: '余额充值管理' },
        { key: 'personal', title: '个人设置', description: '个人信息设置' },
      ],
    },
    {
      key: 'admin',
      title: '管理员区域',
      description: '系统管理功能',
      modules: [
        { key: 'channel', title: '渠道管理', description: 'API渠道配置' },
        { key: 'models', title: '模型管理', description: 'AI模型配置' },
        { key: 'subscription', title: '订阅管理', description: '订阅套餐管理' },
        { key: 'redemption', title: '兑换码管理', description: '兑换码生成管理' },
        { key: 'user', title: '用户管理', description: '用户账户管理' },
        { key: 'setting', title: '系统设置', description: '系统参数配置' },
      ],
    },
  ];

  $: sectionConfigs = sectionConfigsBase
    .filter((section) => isSidebarSectionAllowed(section.key))
    .map((section) => ({
      ...section,
      modules: section.modules.filter((module) => isSidebarModuleAllowed(section.key, module.key)),
    }))
    .filter((section) => section.modules.length > 0 && isAllowedByAdmin(section.key));

  async function loadSidebarConfigs() {
    try {
      if (status?.SidebarModulesAdmin) {
        try {
          const adminConf = JSON.parse(status.SidebarModulesAdmin);
          adminConfig = mergeAdminConfig(adminConf);
        } catch (_) {
          adminConfig = mergeAdminConfig(null);
        }
      } else {
        adminConfig = mergeAdminConfig(null);
      }
      const userRes = await apiGet('/api/user/self');
      if (userRes?.success && userRes.data?.sidebar_modules) {
        let userConf;
        if (typeof userRes.data.sidebar_modules === 'string') {
          userConf = JSON.parse(userRes.data.sidebar_modules);
        } else {
          userConf = userRes.data.sidebar_modules;
        }
        sidebarModulesUser = userConf;
      }
    } catch (e) {
      console.error('加载边栏配置失败:', e);
    }
  }

  async function loadPermissions() {
    const res = await apiGet('/api/user/self');
    if (res?.success) {
      permissions = { ...(res.data.permissions || {}), user: res.data };
    }
  }

  onMount(() => {
    loadPermissions();
    loadSidebarConfigs();
  });

  $: {
    const k = status?.SidebarModulesAdmin ?? '';
    if (k !== prevSidebarAdmin) {
      prevSidebarAdmin = k;
      loadSidebarConfigs();
    }
  }

  function handleSectionChange(sectionKey) {
    return (e) => {
      const checked = e.target.checked;
      sidebarModulesUser = {
        ...sidebarModulesUser,
        [sectionKey]: {
          ...sidebarModulesUser[sectionKey],
          enabled: checked,
        },
      };
    };
  }

  function handleModuleChange(sectionKey, moduleKey) {
    return (e) => {
      const checked = e.target.checked;
      sidebarModulesUser = {
        ...sidebarModulesUser,
        [sectionKey]: {
          ...sidebarModulesUser[sectionKey],
          [moduleKey]: checked,
        },
      };
    };
  }

  async function saveSidebarSettings() {
    sidebarLoading = true;
    try {
      const res = await apiPut('/api/user/self', {
        sidebar_modules: JSON.stringify(sidebarModulesUser),
      });
      if (res?.success) {
        showSuccess('侧边栏设置保存成功');
        await loadSidebarConfigs();
        await loadPermissions();
      } else {
        showError(res?.message || '保存失败');
      }
    } catch (_) {
      showError('保存失败');
    } finally {
      sidebarLoading = false;
    }
  }

  function resetSidebarModules() {
    sidebarModulesUser = JSON.parse(JSON.stringify(DEFAULT_ADMIN_CONFIG));
  }

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
        {#if hasSidebarSettingsPermission()}
          <button
            type="button"
            class="rounded-none px-3 py-1.5 text-sm {activeTab === 'sidebar'
              ? 'border-b-2 border-primary font-medium'
              : 'text-muted-foreground'}"
            on:click={() => (activeTab = 'sidebar')}
          >
            <span class="inline-flex items-center gap-1"><GearSix size={14} /> 边栏设置</span>
          </button>
        {/if}
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
    {:else if currentView === 'sidebar' && hasSidebarSettingsPermission()}
      <p class="mb-4 text-xs text-muted-foreground">您可以个性化设置侧边栏的要显示功能</p>
      <div class="rounded-xl border border-border p-4">
        {#each sectionConfigs as section}
          <div class="mb-6 last:mb-0">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-2">
              <div>
                <div class="font-semibold">{section.title}</div>
                <div class="text-xs text-muted-foreground">{section.description}</div>
              </div>
              <input
                type="checkbox"
                checked={sidebarModulesUser[section.key]?.enabled !== false}
                on:change={handleSectionChange(section.key)}
              />
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {#each section.modules.filter((m) => isAllowedByAdmin(section.key, m.key)) as module}
                <div
                  class="flex items-center justify-between rounded-lg border border-border p-3 {sidebarModulesUser[
                    section.key
                  ]?.enabled === false
                    ? 'opacity-50'
                    : ''}"
                >
                  <div>
                    <div class="text-sm font-medium">{module.title}</div>
                    <div class="text-xs text-muted-foreground">{module.description}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sidebarModulesUser[section.key]?.[module.key] !== false}
                    disabled={sidebarModulesUser[section.key]?.enabled === false}
                    on:change={handleModuleChange(section.key, module.key)}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="flex justify-end gap-2 border-t border-border border-dashed px-4 py-3 md:px-6">
    {#if currentView === 'sidebar'}
      <Button variant="outline" onclick={resetSidebarModules}>重置为默认</Button>
      <Button disabled={sidebarLoading} onclick={saveSidebarSettings}>
        {sidebarLoading ? '保存中...' : '保存设置'}
      </Button>
    {:else}
      <Button onclick={validateAndSave}>保存设置</Button>
    {/if}
  </div>
</div>

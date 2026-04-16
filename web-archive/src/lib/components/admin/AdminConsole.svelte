<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet, apiDelete } from '$lib/api';
  import { setStatusData, isRoot } from '$lib/dashboard/helpers.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import ChannelAddDialog from '$lib/components/dialog/ChannelAddDialog.svelte';
  import ModelPricingPanel from '$lib/components/admin/ModelPricingPanel.svelte';
  import TopupSettingsPanel from '$lib/components/admin/TopupSettingsPanel.svelte';
  import LogDetailDialog from '$lib/components/dialog/LogDetailDialog.svelte';
  import {
    channelTypeParts,
    channelStatusParts,
    channelStatusClass,
  } from '$lib/admin/channelLabels.js';

  /** @type {Record<string, any>} */
  let status = {};

  /** @type {string} */
  let adminTab = 'channel';

  const TAB_DEF = [
    { id: 'channel', label: '渠道管理' },
    { id: 'model_pricing', label: '模型定价', rootOnly: true },
    { id: 'topup_setting', label: '充值设置', rootOnly: true },
    { id: 'subscription', label: '订阅管理' },
    { id: 'redemption', label: '兑换码管理' },
    { id: 'user', label: '用户管理' },
    { id: 'setting', label: '系统设置', rootOnly: true },
    { id: 'log', label: '使用日志' },
    { id: 'midjourney', label: '绘图日志', drawingOnly: true },
  ];

  const LOG_TYPE_LABEL = {
    0: '未知',
    1: '充值',
    2: '消费',
    3: '管理',
    4: '系统',
    5: '错误',
    6: '退款',
  };

  /** @param {number | string | undefined} role */
  function roleLabel(role) {
    const r = Number(role);
    if (r >= 100) return '超级管理员';
    if (r >= 10) return '管理员';
    return '用户';
  }

  /** @param {number} ts */
  function fmtTime(ts) {
    if (ts == null || ts === 0) return '—';
    const n = Number(ts);
    const ms = n < 1e12 ? n * 1000 : n;
    try {
      return new Date(ms).toLocaleString();
    } catch (_) {
      return String(ts);
    }
  }

  /** @param {string} [s] @param {number} n */
  function trunc(s, n = 80) {
    if (s == null || s === '') return '—';
    const str = String(s);
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  /**
   * 仅将对象/数组类型的 JSON 视为复合配置并展开。
   * @param {any} raw
   * @returns {any[] | null}
   */
  function expandCompositeJson(raw) {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    if (!(text.startsWith('{') || text.startsWith('['))) return null;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return null;
      /** @type {{ path: string; value: string }[]} */
      const entries = [];
      flattenComposite(parsed, '', entries);
      return entries.length ? entries : [{ path: '(root)', value: '空对象' }];
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {any} value
   * @param {string} base
   * @param {{ path: string; value: string }[]} out
   */
  function flattenComposite(value, base, out) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push({ path: base || '(root)', value: '[]' });
        return;
      }
      value.forEach((item, idx) => {
        const next = base ? `${base}[${idx}]` : `[${idx}]`;
        flattenComposite(item, next, out);
      });
      return;
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        out.push({ path: base || '(root)', value: '{}' });
        return;
      }
      keys.forEach((k) => {
        const next = base ? `${base}.${k}` : k;
        flattenComposite(value[k], next, out);
      });
      return;
    }
    out.push({
      path: base || '(root)',
      value:
        value == null
          ? 'null'
          : typeof value === 'string'
            ? value
            : typeof value === 'number' || typeof value === 'boolean'
              ? String(value)
              : JSON.stringify(value),
    });
  }

  async function refreshStatus() {
    try {
      const res = await apiGet('/api/status');
      if (res?.success && res.data) {
        status = res.data;
        setStatusData(res.data);
      }
    } catch (_) {}
  }

  onMount(() => {
    const saved = localStorage.getItem('status');
    if (saved) {
      try {
        status = JSON.parse(saved);
      } catch (_) {}
    }
    refreshStatus();
  });

  $: showSettingTab = isRoot();
  $: showDrawingTab = !!status?.enable_drawing;

  $: visibleTabs = (() => {
    const v = TAB_DEF.filter((t) => {
      if (t.rootOnly) return showSettingTab;
      if (t.drawingOnly) return showDrawingTab;
      return true;
    });
    if (v.length > 0) return v;
    return TAB_DEF.filter((t) => !t.rootOnly && !t.drawingOnly);
  })();

  $: {
    if (visibleTabs.length) {
      const ok = visibleTabs.some((t) => t.id === adminTab);
      if (!ok) adminTab = visibleTabs[0].id;
    }
  }

  let loading = false;
  let errorMsg = '';
  /** @type {any[]} */
  let tableRows = [];
  let tableTotal = 0;
  let loadSeq = 0;

  let channelFormOpen = false;
  /** @type {number | null} */
  let channelFormId = null;
  let showDeleteChannel = false;
  /** @type {{ id: number; name: string } | null} */
  let deleteChannelTarget = null;
  let deletingChannel = false;
  let showLogDetail = false;
  let logDetailRid = '';

  function openChannelAdd() {
    channelFormId = null;
    channelFormOpen = true;
  }

  /** @param {any} row */
  function openChannelEdit(row) {
    const id = row?.id;
    if (id == null || id === '') return;
    channelFormId = Number(id);
    channelFormOpen = true;
  }

  /** @param {any} row */
  function openChannelDelete(row) {
    const id = row?.id;
    if (id == null || id === '') return;
    deleteChannelTarget = { id: Number(id), name: String(row.name || '').trim() || `#${id}` };
    showDeleteChannel = true;
  }

  async function confirmDeleteChannel() {
    if (!deleteChannelTarget) return;
    deletingChannel = true;
    try {
      const res = await apiDelete(`/api/channel/${deleteChannelTarget.id}`);
      if (res?.success) {
        showSuccess('渠道已删除');
        showDeleteChannel = false;
        deleteChannelTarget = null;
        loadTabData('channel');
      } else {
        showError(res?.message || '删除失败');
      }
    } catch (_) {
      showError('请求失败');
    } finally {
      deletingChannel = false;
    }
  }

  function openLogDetail(rid) {
    const id = rid != null ? String(rid).trim() : '';
    if (!id) return;
    logDetailRid = id;
    showLogDetail = true;
  }

  async function loadTabData(tab) {
    const seq = ++loadSeq;
    loading = true;
    errorMsg = '';
    tableRows = [];
    tableTotal = 0;
    try {
      /** @type {any} */
      let res;
      if (tab === 'channel') {
        res = await apiGet('/api/channel/?p=1&page_size=50');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败';
          return;
        }
        tableRows = res.data?.items ?? [];
        tableTotal = res.data?.total ?? tableRows.length;
      } else if (tab === 'subscription') {
        res = await apiGet('/api/subscription/admin/plans');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败';
          return;
        }
        const arr = Array.isArray(res.data) ? res.data : [];
        tableRows = arr.map((x) => (x && x.plan ? x.plan : x));
        tableTotal = tableRows.length;
      } else if (tab === 'redemption') {
        res = await apiGet('/api/redemption/?p=1&page_size=50');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败';
          return;
        }
        tableRows = res.data?.items ?? [];
        tableTotal = res.data?.total ?? tableRows.length;
      } else if (tab === 'user') {
        res = await apiGet('/api/user/?p=1&page_size=50');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败';
          return;
        }
        tableRows = res.data?.items ?? [];
        tableTotal = res.data?.total ?? tableRows.length;
      } else if (tab === 'setting') {
        res = await apiGet('/api/option/');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败（需超级管理员）';
          return;
        }
        tableRows = Array.isArray(res.data) ? res.data : [];
        tableTotal = tableRows.length;
      } else if (tab === 'log') {
        res = await apiGet('/api/log/?p=1&page_size=40');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败';
          return;
        }
        tableRows = res.data?.items ?? [];
        tableTotal = res.data?.total ?? tableRows.length;
      } else if (tab === 'midjourney') {
        res = await apiGet('/api/mj/?p=1&page_size=40');
        if (seq !== loadSeq) return;
        if (!res?.success) {
          errorMsg = res?.message || '加载失败';
          return;
        }
        tableRows = res.data?.items ?? [];
        tableTotal = res.data?.total ?? tableRows.length;
      }
    } catch (_) {
      if (seq === loadSeq) errorMsg = '网络错误';
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $: loadTabData(adminTab);
</script>

<div class="admin-console-root w-full">
  <div class="admin-console-card w-full min-w-0">
    <div class="shrink-0 px-4 pt-4 md:px-6 md:pt-6">
      <div class="flex flex-wrap gap-1 border-b border-border">
        {#each visibleTabs as t}
          <button
            type="button"
            class="rounded-none px-3 py-1.5 text-sm {adminTab === t.id
              ? 'border-b-2 border-primary font-medium'
              : 'text-muted-foreground'}"
            onclick={() => (adminTab = t.id)}
          >
            {t.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="admin-console-body">
      {#if loading}
        <p class="shrink-0 text-sm text-muted-foreground">加载中…</p>
      {:else if errorMsg}
        <p class="shrink-0 text-sm text-destructive">{errorMsg}</p>
      {:else if adminTab === 'channel'}
        <div class="admin-console-tab-panel">
        <div class="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-muted-foreground">共 {tableTotal} 条</p>
          <Button size="sm" onclick={openChannelAdd}>添加渠道</Button>
        </div>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>分组</th>
                <th>优先级</th>
                <th class="whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                {@const ct = channelTypeParts(row.type)}
                {@const cs = channelStatusParts(row.status)}
                <tr>
                  <td>{row.id}</td>
                  <td>{row.name || '—'}</td>
                  <td class="max-w-[200px]">
                    <div class="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span class="font-medium">{ct.name}</span>
                      {#if ct.code != null}
                        <span class="text-muted-foreground tabular-nums text-xs" title="后端类型编号"
                          >({ct.code})</span
                        >
                      {/if}
                    </div>
                  </td>
                  <td>
                    <span
                      class="inline-flex items-center rounded-none border px-2 py-0.5 text-xs leading-none {channelStatusClass(
                        row.status,
                      )}"
                    >
                      {cs.label}
                    </span>
                  </td>
                  <td>{row.group || '—'}</td>
                  <td>{row.priority ?? '—'}</td>
                  <td class="whitespace-nowrap">
                    <div class="flex flex-wrap gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        onclick={() => openChannelEdit(row)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onclick={() => openChannelDelete(row)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              {:else}
                <tr><td colspan="7" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {:else if adminTab === 'model_pricing'}
        <div class="admin-console-tab-panel">
          <ModelPricingPanel active={adminTab === 'model_pricing'} />
        </div>
      {:else if adminTab === 'topup_setting'}
        <div class="admin-console-tab-panel">
          <TopupSettingsPanel active={adminTab === 'topup_setting'} />
        </div>
      {:else if adminTab === 'subscription'}
        <div class="admin-console-tab-panel">
        <p class="mb-3 shrink-0 text-xs text-muted-foreground">共 {tableTotal} 个套餐</p>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>价格</th>
                <th>周期</th>
                <th>额度</th>
                <th>启用</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                <tr>
                  <td>{row.id}</td>
                  <td>{row.title || '—'}</td>
                  <td>{row.price_amount ?? '—'} {row.currency || ''}</td>
                  <td>{row.duration_value ?? '—'}{row.duration_unit || ''}</td>
                  <td>{row.total_amount ?? '—'}</td>
                  <td>{row.enabled ? '是' : '否'}</td>
                </tr>
              {:else}
                <tr><td colspan="6" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {:else if adminTab === 'redemption'}
        <div class="admin-console-tab-panel">
        <p class="mb-3 shrink-0 text-xs text-muted-foreground">共 {tableTotal} 条</p>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>兑换码</th>
                <th>额度</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                <tr>
                  <td>{row.id}</td>
                  <td>{row.name || '—'}</td>
                  <td class="font-mono text-xs" title={row.key}>{trunc(row.key, 24)}</td>
                  <td>{row.quota ?? '—'}</td>
                  <td>{row.status ?? '—'}</td>
                  <td class="text-xs">{fmtTime(row.created_time)}</td>
                </tr>
              {:else}
                <tr><td colspan="6" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {:else if adminTab === 'user'}
        <div class="admin-console-tab-panel">
        <p class="mb-3 shrink-0 text-xs text-muted-foreground">共 {tableTotal} 个用户</p>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>角色</th>
                <th>分组</th>
                <th>额度</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                <tr>
                  <td>{row.id}</td>
                  <td>{row.username || '—'}</td>
                  <td>{roleLabel(row.role)}</td>
                  <td>{row.group || '—'}</td>
                  <td>{row.quota ?? '—'}</td>
                  <td>{row.status ?? '—'}</td>
                </tr>
              {:else}
                <tr><td colspan="6" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {:else if adminTab === 'setting'}
        <div class="admin-console-tab-panel">
        <p class="mb-3 shrink-0 text-xs text-muted-foreground">共 {tableTotal} 项配置（敏感键已隐藏）</p>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>键</th>
                <th>值</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                {@const expanded = expandCompositeJson(row.value)}
                <tr>
                  <td class="font-mono text-xs whitespace-nowrap">{row.key}</td>
                  <td class="max-w-md break-all text-xs" title={row.value}>
                    {#if expanded}
                      <div class="space-y-1">
                        {#each expanded.slice(0, 20) as item}
                          <div class="grid grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] gap-2">
                            <span class="font-mono text-[11px] text-muted-foreground">{item.path}</span>
                            <span class="break-all">{trunc(item.value, 120)}</span>
                          </div>
                        {/each}
                        {#if expanded.length > 20}
                          <div class="text-[11px] text-muted-foreground">
                            …其余 {expanded.length - 20} 项已折叠
                          </div>
                        {/if}
                      </div>
                    {:else}
                      {trunc(row.value, 200)}
                    {/if}
                  </td>
                </tr>
              {:else}
                <tr><td colspan="2" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {:else if adminTab === 'log'}
        <div class="admin-console-tab-panel">
        <p class="mb-3 shrink-0 text-xs text-muted-foreground">共 {tableTotal} 条 · 默认最近一页</p>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>用户</th>
                <th>模型</th>
                <th>额度</th>
                <th>渠道</th>
                <th>时间</th>
                <th class="w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                <tr>
                  <td>{LOG_TYPE_LABEL[row.type] ?? row.type}</td>
                  <td>{row.username || '—'}</td>
                  <td class="max-w-[140px] truncate" title={row.model_name}>{row.model_name || '—'}</td>
                  <td>{row.quota ?? '—'}</td>
                  <td>{row.channel ?? '—'}</td>
                  <td class="text-xs whitespace-nowrap">{fmtTime(row.created_at)}</td>
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-7 px-2 text-xs"
                      disabled={!row.request_id}
                      onclick={() => openLogDetail(row.request_id)}
                    >
                      详情
                    </Button>
                  </td>
                </tr>
              {:else}
                <tr><td colspan="7" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {:else if adminTab === 'midjourney'}
        <div class="admin-console-tab-panel">
        <p class="mb-3 shrink-0 text-xs text-muted-foreground">共 {tableTotal} 条任务</p>
        <div class="admin-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>MJ ID</th>
                <th>用户</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>Prompt</th>
              </tr>
            </thead>
            <tbody>
              {#each tableRows as row}
                <tr>
                  <td class="font-mono text-xs">{row.mj_id || '—'}</td>
                  <td>{row.user_id ?? '—'}</td>
                  <td>{row.status || '—'}</td>
                  <td class="text-xs">{fmtTime(row.submit_time)}</td>
                  <td class="max-w-xs text-xs" title={row.prompt}>{trunc(row.prompt, 60)}</td>
                </tr>
              {:else}
                <tr><td colspan="5" class="text-muted-foreground">暂无数据</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<ChannelAddDialog
  bind:open={channelFormOpen}
  channelId={channelFormId}
  onSuccess={() => loadTabData('channel')}
/>
<AlertDialog.Root bind:open={showDeleteChannel}>
  <AlertDialog.Content class="max-w-md">
    <AlertDialog.Header>
      <AlertDialog.Title>删除渠道</AlertDialog.Title>
      <AlertDialog.Description>
        确定删除「{deleteChannelTarget?.name ?? ''}」吗？此操作不可恢复。
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="gap-2">
      <AlertDialog.Cancel disabled={deletingChannel}>取消</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive"
        onclick={confirmDeleteChannel}
        disabled={deletingChannel}
      >
        {deletingChannel ? '删除中…' : '删除'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
<LogDetailDialog bind:open={showLogDetail} requestId={logDetailRid} />

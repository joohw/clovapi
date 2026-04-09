<svelte:options runes={false} />

<script>
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { apiGet, apiPost } from '$lib/api';
  import { copy } from '$lib/dashboard/helpers.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import ModelPricingEditDialog from '$lib/components/dialog/ModelPricingEditDialog.svelte';
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
  } from '$lib/components/ui/table';
  import {
    MODEL_OPTION_KEYS,
    parseNumberMap,
  } from '$lib/admin/modelPricingOptions.js';

  /** 为 true 时加载（由父级 tab 控制） */
  export let active = false;

  let loading = false;
  let loadSeq = 0;
  let errorMsg = '';
  let search = '';
  /** @type {any[]} */
  let models = [];
  /** @type {Record<string, Record<string, number>>} */
  let optionMaps = {};

  let editOpen = false;
  /** @type {any | null} */
  let editModel = null;
  let resettingRatio = false;

  /** @param {any[]} rows @param {string} key */
  function pickOptionValue(rows, key) {
    const row = rows.find((r) => r && r.key === key);
    return row?.value != null ? String(row.value) : '';
  }

  /**
   * @param {string} vendorIcon
   * @param {string} vendorName
   */
  function resolveVendorIcon(vendorIcon, vendorName = '') {
    const raw = String(vendorIcon || '').trim();
    if (!raw && !vendorName) return '';
    if (
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:image/')
    ) {
      return raw;
    }
    const key = (raw || vendorName).split('.')[0].toLowerCase();
    /** @type {Record<string, string>} */
    const iconMap = {
      openai: 'openai',
      claude: 'anthropic',
      anthropic: 'anthropic',
      gemini: 'googlegemini',
      google: 'google',
      xai: 'x',
      grok: 'x',
      cohere: 'cohere',
      qwen: 'alibabacloud',
      alibaba: 'alibabacloud',
      azure: 'microsoftazure',
      microsoftazure: 'microsoftazure',
      deepseek: 'deepseek',
      zhipu: 'zhipu',
      doubao: 'bytedance',
      volcengine: 'bytedance',
      mistral: 'mistralai',
      siliconcloud: 'icloud',
    };
    const slug = iconMap[key] || '';
    return slug ? `https://cdn.simpleicons.org/${slug}/000000` : '';
  }

  /**
   * @param {unknown} value
   */
  function formatUsdPrice(value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value === 0) return '—';
    return `$${value.toFixed(3)}`;
  }

  /**
   * 模型溢价倍率（默认 1）
   * @param {unknown} value
   */
  function formatPremium(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return value.toFixed(3);
  }

  async function loadAllData() {
    const seq = ++loadSeq;
    loading = true;
    errorMsg = '';
    try {
      const [prRes, optRes] = await Promise.all([
        apiGet('/api/pricing'),
        apiGet('/api/option/'),
      ]);
      if (seq !== loadSeq) return;
      if (!prRes?.success) {
        errorMsg = prRes?.message || '定价列表加载失败';
        models = [];
        return;
      }
      if (!optRes?.success) {
        errorMsg = optRes?.message || '选项加载失败（需超级管理员）';
        models = [];
        return;
      }

      const vendorMap = {};
      if (Array.isArray(prRes.vendors)) {
        for (const vendor of prRes.vendors) {
          vendorMap[vendor.id] = vendor;
        }
      }
      const sourceModels = Array.isArray(prRes.data) ? prRes.data : [];
      models = sourceModels
        .map((model) => {
          const vendor = model.vendor_id ? vendorMap[model.vendor_id] : null;
          return {
            ...model,
            vendor_name: model.vendor_name || vendor?.name || '',
            vendor_icon: model.vendor_icon || vendor?.icon || '',
          };
        })
        .sort((a, b) =>
          String(a.model_name || '').localeCompare(String(b.model_name || ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        );

      const rows = Array.isArray(optRes.data) ? optRes.data : [];
      /** @type {Record<string, Record<string, number>>} */
      const nextMaps = {};
      for (const k of MODEL_OPTION_KEYS) {
        nextMaps[k] = parseNumberMap(pickOptionValue(rows, k));
      }
      optionMaps = nextMaps;
    } catch (_) {
      if (seq === loadSeq) {
        errorMsg = '网络错误';
        models = [];
      }
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $: if (active) {
    void loadAllData();
  }

  $: filteredModels = models.filter((m) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    return (
      (m.model_name || '').toLowerCase().includes(keyword) ||
      (m.description || '').toLowerCase().includes(keyword) ||
      (m.tags || '').toLowerCase().includes(keyword) ||
      (m.vendor_name || '').toLowerCase().includes(keyword)
    );
  });

  /** @param {any} m */
  function openEdit(m) {
    editModel = m;
    editOpen = true;
  }

  async function resetModelRatio() {
    resettingRatio = true;
    try {
      const res = await apiPost('/api/option/rest_model_ratio', {});
      if (res?.success) {
        showSuccess('已清空模型美元定价配置');
        await loadAllData();
      } else {
        showError(res?.message || '重置失败');
      }
    } catch (_) {
      showError('请求失败');
    } finally {
      resettingRatio = false;
    }
  }

  /**
   * @param {string} [name]
   */
  async function copyModelName(name) {
    const text = String(name ?? '').trim();
    if (!text) return;
    const ok = await copy(text);
    if (ok) showSuccess('已复制到剪贴板');
    else showError('复制失败');
  }
</script>

<div class="model-pricing-panel flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
  <p class="shrink-0 text-xs text-muted-foreground">
    全站已启用模型（各分组 abilities 并集）。未配置美元价的模型也会列出，便于补价；实际扣费仍以是否配置有效定价为准。普通用户在公开「模型」页仅能看到其分组可用且（默认）已定价的子集。编辑弹窗写入 ModelInputUSDPerM / ModelOutputUSDPerM / ModelCacheReadUSDPerM / ModelPerCallUSD。
  </p>

  <div class="flex shrink-0 flex-wrap items-center gap-2">
    <Button
      variant="outline"
      size="sm"
      class="h-8 text-xs"
      disabled={loading || resettingRatio}
      onclick={loadAllData}
    >
      刷新
    </Button>
    <Button
      variant="outline"
      size="sm"
      class="h-8 text-xs text-destructive hover:text-destructive"
      disabled={loading || resettingRatio}
      onclick={resetModelRatio}
    >
      {resettingRatio ? '重置中…' : '清空模型美元定价'}
    </Button>
  </div>

  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
  >
    <div class="shrink-0 border-b border-border p-3">
      <Input type="text" bind:value={search} placeholder="搜索模型/描述/标签/供应商" />
    </div>

    {#if loading}
      <div class="shrink-0 p-4 text-sm text-muted-foreground">加载中…</div>
    {:else if errorMsg}
      <div class="shrink-0 p-4 text-sm text-destructive">{errorMsg}</div>
    {:else if filteredModels.length === 0}
      <div class="shrink-0 p-4 text-sm text-muted-foreground">暂无数据</div>
    {:else}
      <div class="min-h-0 flex-1 overflow-auto bg-muted/20">
        <Table>
          <TableHeader class="[&_th]:bg-muted/80">
            <TableRow class="border-border hover:bg-transparent">
              <TableHead>模型</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>类型</TableHead>
              <TableHead class="whitespace-nowrap" title="在美元成本与分组倍率之上再乘的溢价，默认 1"
                >溢价</TableHead
              >
              <TableHead class="whitespace-nowrap">输入 USD/M</TableHead>
              <TableHead class="whitespace-nowrap">输出 USD/M</TableHead>
              <TableHead class="whitespace-nowrap">缓存 USD/M</TableHead>
              <TableHead class="whitespace-nowrap">按次 USD</TableHead>
              <TableHead class="whitespace-nowrap">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each filteredModels as model}
              <TableRow>
                <TableCell>
                  {#if model.model_name}
                    <button
                      type="button"
                      class="cursor-pointer text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
                      onclick={() => copyModelName(model.model_name)}
                      title="点击复制"
                    >
                      {model.model_name}
                    </button>
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell>
                  {#if model.vendor_name}
                    <div class="flex items-center gap-2">
                      {#if resolveVendorIcon(model.vendor_icon, model.vendor_name)}
                        <img
                          src={resolveVendorIcon(model.vendor_icon, model.vendor_name)}
                          alt={model.vendor_name}
                          class="h-4 w-4 rounded-sm dark:invert"
                        />
                      {/if}
                      <span class="text-xs">{model.vendor_name}</span>
                    </div>
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-xs">
                  {model.quota_type === 0 ? '按量' : model.quota_type === 1 ? '按次' : '—'}
                </TableCell>
                <TableCell class="tabular-nums text-xs" title="ModelPremiumRatio"
                  >{formatPremium(model.premium_ratio)}</TableCell
                >
                <TableCell class="tabular-nums text-xs">
                  {model.quota_type === 0 ? formatUsdPrice(model.input_usd_per_m) : '—'}
                </TableCell>
                <TableCell class="tabular-nums text-xs">
                  {model.quota_type === 0 ? formatUsdPrice(model.output_usd_per_m) : '—'}
                </TableCell>
                <TableCell class="tabular-nums text-xs">
                  {model.quota_type === 0 ? formatUsdPrice(model.cache_read_usd_per_m) : '—'}
                </TableCell>
                <TableCell class="tabular-nums text-xs">
                  {model.quota_type === 1 ? formatUsdPrice(model.per_call_usd) : '—'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 px-2 text-xs"
                    onclick={() => openEdit(model)}
                  >
                    编辑
                  </Button>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}
  </div>
</div>

<ModelPricingEditDialog
  bind:open={editOpen}
  model={editModel}
  {optionMaps}
  onSaved={loadAllData}
/>

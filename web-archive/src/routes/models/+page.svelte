<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet, apiUrl } from '$lib/api';
  import { copy } from '$lib/dashboard/helpers.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import { Input } from '$lib/components/ui/input';
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
  } from '$lib/components/ui/table';
  import { resolveVendorIcon } from '$lib/vendorIcon.js';

  let loading = true;
  let errorMsg = '';
  let search = '';
  /** @type {any[]} */
  let models = [];
  /** @type {'model_name'|'vendor_name'|'premium_ratio'|'input_price'|'output_price'|'cache_read_price'|'per_call_price'|null} */
  let sortKey = null;
  /** @type {'asc'|'desc'|null} */
  let sortDirection = null;

  /**
   * @param {string} modelName
   * @returns {string}
   */
  function inferVendorNameFromModelName(modelName) {
    const raw = String(modelName || '').trim();
    if (!raw) return '';
    const idx = raw.indexOf('/');
    if (idx <= 0) return '';
    return raw.slice(0, idx);
  }

  /**
   * @param {string} modelName
   * @param {Record<string, any>} specIndex
   */
  function findModelSpec(modelName, specIndex) {
    const key = String(modelName || '').trim();
    if (!key) return null;
    if (specIndex[key]) return specIndex[key];
    const slashIdx = key.indexOf('/');
    if (slashIdx > 0) {
      const shortKey = key.slice(slashIdx + 1);
      if (specIndex[shortKey]) return specIndex[shortKey];
    }
    return null;
  }

  /**
   * 从模型索引（api.json / api.ex.json）合并 spec。
   * @param {Record<string, any>} index
   * @param {any} apiIndex
   * @param {boolean} overwrite
   */
  function mergeModelSpecIndex(index, apiIndex, overwrite = false) {
    if (!apiIndex || typeof apiIndex !== 'object') return index;
    for (const provider of Object.values(apiIndex)) {
      const modelsMap = provider?.models;
      if (!modelsMap || typeof modelsMap !== 'object') continue;
      for (const [modelKey, modelSpec] of Object.entries(modelsMap)) {
        const id = String(modelSpec?.id || modelKey || '').trim();
        if (!id) continue;
        if (!overwrite && index[id]) continue;
        index[id] = modelSpec;
      }
    }
    return index;
  }

  async function loadPricing() {
    loading = true;
    errorMsg = '';
    try {
      const [res, apiSpecPayload, apiExSpecPayload] = await Promise.all([
        apiGet('/api/pricing'),
        fetch(apiUrl('/api.json'), {
          method: 'GET',
          headers: { 'Cache-Control': 'no-store' }
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(apiUrl('/api.ex.json'), {
          method: 'GET',
          headers: { 'Cache-Control': 'no-store' }
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      ]);
      if (res?.success) {
        const vendorMap = {};
        /** @type {Record<string, any>} */
        const modelSpecIndex = {};
        // api.ex.json is manually maintained with lower priority.
        mergeModelSpecIndex(modelSpecIndex, apiExSpecPayload, false);
        mergeModelSpecIndex(modelSpecIndex, apiSpecPayload, true);
        if (Array.isArray(res.vendors)) {
          for (const vendor of res.vendors) {
            vendorMap[vendor.id] = vendor;
          }
        }

        const sourceModels = Array.isArray(res.data) ? res.data : [];
        models = sourceModels.map((model) => {
          const vendor = model.vendor_id ? vendorMap[model.vendor_id] : null;
          const inferredVendorName = inferVendorNameFromModelName(model.model_name);
          const modelSpec = findModelSpec(model.model_name, modelSpecIndex);
          return {
            ...model,
            vendor_name: model.vendor_name || vendor?.name || inferredVendorName || '',
            vendor_icon: model.vendor_icon || vendor?.icon || '',
            spec: model.spec || modelSpec || null,
            modalities: model.modalities || modelSpec?.modalities || null
          };
        });
      } else {
        errorMsg = res?.message || '加载失败';
      }
    } catch (err) {
      errorMsg = '加载模型失败';
    } finally {
      loading = false;
    }
  }

  /**
   * 后端 GetPricing 折算后的展示价（已乘适用分组倍率；按量：每百万 token；按次：每次调用）
   * @param {unknown} value
   */
  function formatUsdPrice(value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value === 0) return '-';
    return `$${value.toFixed(3)}`;
  }

  /**
   * 按次计费（quota_type=1，如图像/视频等）：与后端约定 input_price 为每次调用的美元价（含后端分组折算）
   * @param {any} model
   */
  function formatPerCallUsd(model) {
    if (model?.quota_type !== 1) return '-';
    return formatUsdPrice(model.input_price);
  }

  /**
   * @param {any} model
   */
  function formatCacheReadUsd(model) {
    if (model?.quota_type !== 0) return '-';
    return formatUsdPrice(model.cache_read_price);
  }

  /**
   * @param {unknown} value
   */
  function formatPremium(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return value.toFixed(3);
  }

  /**
   * 从 spec 提取推理能力（是否支持 reasoning）。
   * @param {any} model
   * @returns {{ label: string; supported: boolean | null }}
   */
  function getReasoningCapability(model) {
    const reasoning = model?.spec?.reasoning;
    if (typeof reasoning === 'boolean') {
      return { label: reasoning ? '支持' : '', supported: reasoning };
    }
    if (reasoning && typeof reasoning === 'object') {
      // object form is considered supported (e.g. has levels/modes)
      return { label: '支持', supported: true };
    }
    return { label: '', supported: null };
  }

  /**
   * @param {typeof sortKey} key
   */
  function toggleSort(key) {
    if (sortKey !== key) {
      sortKey = key;
      sortDirection = 'asc';
      return;
    }
    if (sortDirection === 'asc') {
      sortDirection = 'desc';
      return;
    }
    sortKey = null;
    sortDirection = null;
  }

  /**
   * @param {typeof sortKey} key
   */
  function sortIndicator(key) {
    if (sortKey !== key || !sortDirection) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  /**
   * @param {any} model
   * @param {typeof sortKey} key
   */
  function getSortValue(model, key) {
    if (!key) return null;
    switch (key) {
      case 'model_name':
        return (model?.model_name || '').toLowerCase();
      case 'vendor_name':
        return (model?.vendor_name || '').toLowerCase();
      case 'premium_ratio':
        return typeof model?.premium_ratio === 'number' ? model.premium_ratio : null;
      case 'input_price':
        return typeof model?.input_price === 'number' ? model.input_price : null;
      case 'output_price':
        return typeof model?.output_price === 'number' ? model.output_price : null;
      case 'cache_read_price':
        if (model?.quota_type !== 0) return null;
        return typeof model?.cache_read_price === 'number' ? model.cache_read_price : null;
      case 'per_call_price':
        if (model?.quota_type !== 1) return null;
        return typeof model?.input_price === 'number' ? model.input_price : null;
      default:
        return null;
    }
  }

  $: filteredModels = models.filter((m) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    return (
      (m.model_name || '').toLowerCase().includes(keyword) ||
      (m.description || '').toLowerCase().includes(keyword) ||
      (m.tags || '').toLowerCase().includes(keyword) ||
      (m.vendor_name || '').toLowerCase().includes(keyword) ||
      getReasoningCapability(m).label.toLowerCase().includes(keyword)
    );
  });

  $: sortedModels = (() => {
    if (!sortKey || !sortDirection) return filteredModels;
    const factor = sortDirection === 'asc' ? 1 : -1;
    return [...filteredModels].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const aNil = av === null || av === undefined || av === '';
      const bNil = bv === null || bv === undefined || bv === '';
      if (aNil && bNil) return 0;
      if (aNil) return 1;
      if (bNil) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv), 'zh-Hans-CN') * factor;
    });
  })();

  onMount(loadPricing);

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

  /**
   * 图标加载失败时，回退到基于供应商/模型名推导的本地图标。
   * @param {Event} event
   * @param {any} model
   */
  function onVendorIconError(event, model) {
    const img = /** @type {HTMLImageElement} */ (event.currentTarget);
    if (!img) return;
    const fallback = resolveVendorIcon('', model?.vendor_name, model?.model_name);
    if (!fallback || img.src.endsWith(fallback)) return;
    img.src = fallback;
  }
</script>

<div class="models-page page-wrap flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="models-page-title">
  <h1 id="models-page-title" class="sr-only">模型广场</h1>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-neutral-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70"
  >
    <div class="shrink-0 border-b border-gray-200 p-3 dark:border-zinc-700">
      <Input type="text" bind:value={search} placeholder="搜索模型/描述/标签" />
    </div>

    {#if loading}
      <div class="shrink-0 p-4 text-sm opacity-70">加载中...</div>
    {:else if errorMsg}
      <div class="shrink-0 p-4 text-sm text-red-500">{errorMsg}</div>
    {:else if filteredModels.length === 0}
      <div class="shrink-0 p-4 text-sm opacity-70">暂无数据</div>
    {:else}
      <div
        class="min-h-0 flex-1 overflow-auto bg-neutral-50 dark:bg-zinc-950/70"
      >
        <Table>
          <TableHeader
            class="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-neutral-100/95 dark:[&_th]:bg-zinc-900/90"
          >
            <TableRow class="border-gray-200 hover:bg-transparent dark:border-zinc-700 dark:hover:bg-transparent">
              <TableHead>
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('model_name')}>
                  模型
                  <span class="text-xs opacity-70">{sortIndicator('model_name')}</span>
                </button>
              </TableHead>
              <TableHead>
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('vendor_name')}>
                  供应商
                  <span class="text-xs opacity-70">{sortIndicator('vendor_name')}</span>
                </button>
              </TableHead>
              <TableHead>推理能力</TableHead>
              <TableHead title="在成本与分组倍率之上的模型溢价，默认 1">
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('premium_ratio')}>
                  溢价
                  <span class="text-xs opacity-70">{sortIndicator('premium_ratio')}</span>
                </button>
              </TableHead>
              <TableHead>
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('input_price')}>
                  输入价格
                  <span class="text-xs opacity-70">{sortIndicator('input_price')}</span>
                </button>
              </TableHead>
              <TableHead>
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('output_price')}>
                  输出价格
                  <span class="text-xs opacity-70">{sortIndicator('output_price')}</span>
                </button>
              </TableHead>
              <TableHead>
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('cache_read_price')}>
                  缓存命中
                  <span class="text-xs opacity-70">{sortIndicator('cache_read_price')}</span>
                </button>
              </TableHead>
              <TableHead>
                <button type="button" class="flex items-center gap-1" onclick={() => toggleSort('per_call_price')}>
                  单次价格
                  <span class="text-xs opacity-70">{sortIndicator('per_call_price')}</span>
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each sortedModels as model}
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
                    -
                  {/if}
                </TableCell>
                <TableCell>
                  {#if model.vendor_name}
                    <div class="flex items-center gap-2">
                      {#if resolveVendorIcon(model.vendor_icon, model.vendor_name, model.model_name)}
                        <img
                          src={resolveVendorIcon(model.vendor_icon, model.vendor_name, model.model_name)}
                          alt={model.vendor_name}
                          class="h-4 w-4 rounded-sm dark:invert"
                          onerror={(event) => onVendorIconError(event, model)}
                        />
                      {/if}
                      <span>{model.vendor_name}</span>
                    </div>
                  {:else}
                    -
                  {/if}
                </TableCell>
                <TableCell>
                  {#if getReasoningCapability(model).supported === true}
                    <span class="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">支持</span>
                  {/if}
                </TableCell>
                <TableCell>{formatPremium(model.premium_ratio)}</TableCell>
                <TableCell>{formatUsdPrice(model.input_price)}</TableCell>
                <TableCell>{formatUsdPrice(model.output_price)}</TableCell>
                <TableCell>{formatCacheReadUsd(model)}</TableCell>
                <TableCell>{formatPerCallUsd(model)}</TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}
  </div>
</div>

<style>
  .models-page :global([data-slot='table-container']) {
    overflow: visible;
  }
</style>

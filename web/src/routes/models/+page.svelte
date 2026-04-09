<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet } from '$lib/api';
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

  let loading = true;
  let errorMsg = '';
  let search = '';
  /** @type {any[]} */
  let models = [];

  async function loadPricing() {
    loading = true;
    errorMsg = '';
    try {
      const res = await apiGet('/api/pricing');
      if (res?.success) {
        const vendorMap = {};
        if (Array.isArray(res.vendors)) {
          for (const vendor of res.vendors) {
            vendorMap[vendor.id] = vendor;
          }
        }

        const sourceModels = Array.isArray(res.data) ? res.data : [];
        models = sourceModels.map((model) => {
          const vendor = model.vendor_id ? vendorMap[model.vendor_id] : null;
          return {
            ...model,
            vendor_name: model.vendor_name || vendor?.name || '',
            vendor_icon: model.vendor_icon || vendor?.icon || ''
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
   * 兼容后端返回的 vendor_icon：
   * - URL（http/https/data:image）直接使用
   * - 图标名（如 OpenAI.Color）映射到简单图标 CDN
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
      siliconcloud: 'icloud'
    };

    const slug = iconMap[key] || '';
    return slug ? `https://cdn.simpleicons.org/${slug}/000000` : '';
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
</script>

<div class="models-page page-wrap flex min-h-0 flex-1 flex-col overflow-hidden">
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-sm dark:border-zinc-700"
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
          <TableHeader class="[&_th]:bg-neutral-100/95 dark:[&_th]:bg-zinc-900/90">
            <TableRow class="border-gray-200 hover:bg-transparent dark:border-zinc-700 dark:hover:bg-transparent">
              <TableHead>模型</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>类型</TableHead>
              <TableHead title="在成本与分组倍率之上的模型溢价，默认 1">溢价</TableHead>
              <TableHead>输入价格</TableHead>
              <TableHead>输出价格</TableHead>
              <TableHead>缓存命中</TableHead>
              <TableHead>单次价格</TableHead>
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
                    -
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
                      <span>{model.vendor_name}</span>
                    </div>
                  {:else}
                    -
                  {/if}
                </TableCell>
                <TableCell>{model.quota_type === 0 ? '按量' : model.quota_type === 1 ? '按次' : '-'}</TableCell>
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

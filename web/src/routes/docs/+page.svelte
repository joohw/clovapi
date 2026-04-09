<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { apiGet } from '$lib/api';

  let loading = true;
  let errorMsg = '';
  let iframeUrl = '';
  let htmlContent = '';

  async function loadDocs() {
    loading = true;
    errorMsg = '';
    iframeUrl = '';
    htmlContent = localStorage.getItem('docs') || '';

    try {
      const res = await apiGet('/api/about');
      if (!res?.success) {
        errorMsg = res?.message || '加载失败';
        return;
      }

      const data = String(res.data || '');
      if (!data) {
        htmlContent = '';
        return;
      }

      if (data.startsWith('https://')) {
        iframeUrl = data;
        localStorage.setItem('docs', data);
        return;
      }

      htmlContent = await marked.parse(data);
      localStorage.setItem('docs', htmlContent);
    } catch (err) {
      errorMsg = '加载文档内容失败';
    } finally {
      loading = false;
    }
  }

  onMount(loadDocs);
</script>

<div class="docs-page page-wrap flex min-h-0 flex-1 flex-col">
  <div
    class="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-sm dark:border-zinc-700"
  >
    <div class="bg-neutral-50 dark:bg-zinc-950/70">
      {#if loading}
        <div class="p-4 text-sm opacity-70 md:p-6">加载中...</div>
      {:else if errorMsg}
        <div class="p-4 text-sm text-red-500 md:p-6">{errorMsg}</div>
      {:else if iframeUrl}
        <div class="min-h-[78vh] w-full">
          <iframe title="文档" src={iframeUrl} class="h-[78vh] w-full border-0"></iframe>
        </div>
      {:else if !htmlContent}
        <div class="p-4 text-sm opacity-70 md:p-6">管理员暂时未设置任何文档内容</div>
      {:else}
        <div class="prose prose-neutral max-w-none p-4 dark:prose-invert md:p-6 lg:p-8">
          {@html htmlContent}
        </div>
      {/if}
    </div>
  </div>
</div>

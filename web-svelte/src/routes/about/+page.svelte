<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { apiGet } from '$lib/api';
  import { Button } from '$lib/components/ui/button';

  let loading = true;
  let errorMsg = '';
  let iframeUrl = '';
  let htmlContent = '';

  async function loadAbout() {
    loading = true;
    errorMsg = '';
    iframeUrl = '';
    htmlContent = localStorage.getItem('about') || '';

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
        localStorage.setItem('about', data);
        return;
      }

      htmlContent = await marked.parse(data);
      localStorage.setItem('about', htmlContent);
    } catch (err) {
      errorMsg = '加载教程内容失败';
    } finally {
      loading = false;
    }
  }

  onMount(loadAbout);
</script>

<div class="page-wrap">
  <div class="toolbar">
    <h1 class="text-2xl font-semibold">教程</h1>
    <Button variant="outline" onclick={loadAbout} disabled={loading}>
      {loading ? '刷新中...' : '刷新'}
    </Button>
  </div>

  {#if loading}
    <div class="panel p-4 text-sm opacity-70">加载中...</div>
  {:else if errorMsg}
    <div class="panel p-4 text-sm text-red-500">{errorMsg}</div>
  {:else if iframeUrl}
    <div class="panel">
      <iframe title="about" src={iframeUrl} style="width:100%;height:78vh;border:none;"></iframe>
    </div>
  {:else if !htmlContent}
    <div class="panel p-4 text-sm opacity-70">管理员暂时未设置任何关于内容</div>
  {:else}
    <div class="panel p-4 prose dark:prose-invert max-w-none">
      {@html htmlContent}
    </div>
  {/if}
</div>

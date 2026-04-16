<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { apiGet } from '$lib/api';
  import { copy } from '$lib/dashboard/helpers.js';
  import { showSuccess } from '$lib/dashboard/notify.js';
  import { Code, Copy, CheckCircle, TerminalWindow } from 'phosphor-svelte';

  let aboutLoading = true;
  let errorMsg = '';
  let iframeUrl = '';
  let htmlContent = '';

  /** @type {Record<string, unknown>} */
  let status = {};
  let copiedBase = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let copyResetTimer;

  $: serverAddress =
    (status && typeof status.server_address === 'string' && status.server_address) ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  $: apiBaseUrl = (() => {
    const raw = String(serverAddress || '').replace(/\/+$/, '');
    if (!raw) return '';
    if (raw.endsWith('/v1')) return raw;
    return `${raw}/v1`;
  })();

  async function loadStatus() {
    try {
      const local = localStorage.getItem('status');
      if (local) {
        status = JSON.parse(local);
      }
    } catch (_) {
      // ignore
    }
    try {
      const res = await apiGet('/api/status');
      if (res?.success && res?.data) {
        status = res.data;
        localStorage.setItem('status', JSON.stringify(res.data));
      }
    } catch (_) {
      // ignore
    }
  }

  async function loadDocs() {
    aboutLoading = true;
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
      aboutLoading = false;
    }
  }

  async function copyApiBase() {
    if (!apiBaseUrl) return;
    const ok = await copy(apiBaseUrl);
    if (ok) {
      copiedBase = true;
      showSuccess('已复制 API 基址');
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copiedBase = false;
      }, 2000);
    }
  }

  onMount(async () => {
    await Promise.all([loadStatus(), loadDocs()]);
  });
</script>

<div class="docs-page page-wrap flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="docs-page-title">
  <h1 id="docs-page-title" class="sr-only">文档中心</h1>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-sm dark:border-zinc-700"
  >
    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-50 dark:bg-zinc-950/70"
    >
      <div
        class="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch"
      >
        <aside
          class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b border-gray-200 p-4 md:p-6 lg:border-b-0 lg:border-r lg:pr-6 dark:border-zinc-700"
          aria-labelledby="docs-editor-setup-heading"
        >
          <h2
            id="docs-editor-setup-heading"
            class="mb-4 flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground md:text-xl"
          >
            <TerminalWindow class="h-5 w-5 shrink-0 opacity-85 md:h-6 md:w-6" weight="duotone" />
            配置 OpenClaw / Claude Code
          </h2>
          <div class="mb-4 rounded-lg border border-border bg-background/60 p-3 text-base leading-relaxed text-foreground/90">
            当前页面仅保留通用 API 接入文档。OpenClaw / Claude Code 一键配置待开放。
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {#if aboutLoading}
              <div class="text-base text-muted-foreground">加载中...</div>
            {:else if errorMsg}
              <div class="text-base text-destructive">{errorMsg}</div>
            {:else if iframeUrl}
              <div
                class="h-full min-h-0 w-full overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-700"
              >
                <iframe title="文档" src={iframeUrl} class="block h-full min-h-0 w-full border-0"></iframe>
              </div>
            {:else if htmlContent}
              <div
                class="docs-dynamic prose prose-neutral max-w-none dark:prose-invert prose-base prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:rounded-lg prose-pre:border prose-pre:border-border prose-pre:bg-muted/60 prose-pre:leading-relaxed prose-code:rounded prose-code:border prose-code:border-border/80 prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-a:font-medium prose-a:text-primary"
              >
                {@html htmlContent}
              </div>
            {:else}
              <div class="text-base leading-relaxed text-muted-foreground">暂无文档内容。</div>
            {/if}
          </div>
        </aside>

        <section
          class="flex min-h-0 min-w-0 flex-1 flex-col p-4 md:p-6 lg:pl-6"
          aria-labelledby="docs-api-dev-heading"
        >
          <h2
            id="docs-api-dev-heading"
            class="mb-4 flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground md:text-xl"
          >
            <Code class="h-5 w-5 shrink-0 opacity-85 md:h-6 md:w-6" weight="duotone" />
            使用 API 开发应用
          </h2>
          <p class="mb-4 text-base leading-relaxed text-foreground/90">
            在自有服务、脚本或移动端中调用本站；请求格式与 OpenAI 兼容 API 一致，使用控制台中的令牌作为
            <code class="rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.875em] text-foreground"
              >Authorization: Bearer</code
            >。
          </p>
          {#if apiBaseUrl}
            <button
              type="button"
              class="group flex w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/30 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-muted/25"
              aria-label={copiedBase ? '基址已复制到剪贴板' : '点击复制 Base URL'}
              onclick={copyApiBase}
            >
              <div class="flex min-w-0 flex-1 items-center px-3 py-2 text-left sm:px-4">
                <code class="block w-full break-all font-mono text-base leading-snug text-foreground">{apiBaseUrl}</code>
              </div>
              <div
                class="flex shrink-0 items-center gap-2 border-l border-border bg-muted/25 px-3 py-2 text-sm font-medium text-muted-foreground group-hover:bg-muted/40 sm:px-4"
              >
                {#if copiedBase}
                  <CheckCircle class="size-4 shrink-0 text-emerald-500" weight="fill" aria-hidden="true" />
                  <span class="whitespace-nowrap text-emerald-600 dark:text-emerald-400">已复制</span>
                {:else}
                  <Copy class="size-4 shrink-0 opacity-70" aria-hidden="true" />
                  <span class="whitespace-nowrap">复制</span>
                {/if}
              </div>
            </button>
          {/if}
          <ul class="mt-4 list-inside list-disc space-y-2 text-base leading-relaxed text-foreground/90">
            <li>将 Base URL 设为上述地址（通常以 <code class="font-mono text-[0.9em] text-foreground">/v1</code> 结尾）。</li>
            <li>对话、嵌入、图像等路径与常见 OpenAI 兼容网关一致，可按控制台内模型名调用。</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.docs-dynamic pre) {
    max-width: 100%;
    overflow-x: auto;
  }

  :global(.docs-dynamic pre code) {
    font-size: 0.9em;
    line-height: 1.6;
  }
</style>

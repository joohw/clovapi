<svelte:options runes={false} />

<script>
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import { goto } from '$app/navigation';
  import { apiGet } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Copy, CheckCircle } from 'phosphor-svelte';

  /**
   * 首页展示的接口示例：功能说明 + 路径。
   * `suffix`：接在「含 /v1 的基址」后的路径，如 /chat/completions。
   * `fromRoot`：相对站点根路径，如 /v1beta/models（不经由 /v1 拼接）。
   */
  const API_EXAMPLES = [
    { label: '对话补全', suffix: '/chat/completions' },
    { label: 'Responses API', suffix: '/responses' },
    { label: 'Claude Messages', suffix: '/messages' },
    { label: '模型列表', fromRoot: '/v1beta/models' },
    { label: '文本嵌入', suffix: '/embeddings' },
    { label: '重排序', suffix: '/rerank' },
    { label: '图像生成', suffix: '/images/generations' },
    { label: '语音合成', suffix: '/audio/speech' }
  ];

  /** 首页「支持 300+ 模型 API」条：Logo 来自 https://models.dev/logos/{id}.svg */
  const PROVIDER_LOGOS = [
    { id: 'openai', alt: 'OpenAI' },
    { id: 'anthropic', alt: 'Anthropic' },
    { id: 'google', alt: 'Google Gemini' },
    { id: 'mistral', alt: 'Mistral AI' },
    { id: 'deepseek', alt: 'DeepSeek' },
    { id: 'xai', alt: 'xAI' },
    { id: 'azure', alt: 'Microsoft Azure' },
    { id: 'groq', alt: 'Groq' },
    { id: 'nvidia', alt: 'NVIDIA' },
    { id: 'cohere', alt: 'Cohere' },
    { id: 'huggingface', alt: 'Hugging Face' },
    { id: 'openrouter', alt: 'OpenRouter' },
  ];

  let status = {};
  let homePageContentLoaded = false;
  let homePageContent = '';
  let noticeVisible = false;
  let noticeContent = '';
  let copiedBase = false;
  let copyResetTimer;
  let hasSession = false;

  $: serverAddress = status?.server_address || window.location.origin;
  $: isDemoSiteMode = Boolean(status?.demo_site_enabled);

  /** 展示与复制用：始终以 /v1 结尾，不重复拼接 */
  $: apiBaseUrl = (() => {
    const raw = String(serverAddress || '').replace(/\/+$/, '');
    if (raw.endsWith('/v1')) return raw;
    return `${raw}/v1`;
  })();

  /** 站点根（去掉末尾 /v1），用于 /v1beta 等路径 */
  $: siteRoot = String(serverAddress || '').replace(/\/+$/, '').replace(/\/v1$/, '');

  $: hasSession = typeof window !== 'undefined' && !!localStorage.getItem('user');

  /**
   * @param {{ suffix?: string; fromRoot?: string }} item
   */
  function exampleFullUrl(item) {
    if (item.fromRoot) return siteRoot + item.fromRoot;
    const base = apiBaseUrl.replace(/\/+$/, '');
    return base + (item.suffix || '');
  }

  async function loadStatus() {
    try {
      const local = localStorage.getItem('status');
      if (local) {
        status = JSON.parse(local);
      }
    } catch (_) {
      // ignore parse errors
    }

    try {
      const res = await apiGet('/api/status');
      if (res?.success && res?.data) {
        status = res.data;
        localStorage.setItem('status', JSON.stringify(res.data));
      }
    } catch (_) {
      // ignore network errors, use cached status
    }
  }

  async function loadHomePageContent() {
    homePageContent = localStorage.getItem('home_page_content') || '';
    try {
      const res = await apiGet('/api/home_page_content');
      if (res?.success) {
        const data = String(res.data || '');
        if (data && !data.startsWith('https://')) {
          homePageContent = await marked.parse(data);
        } else {
          homePageContent = data;
        }
        localStorage.setItem('home_page_content', homePageContent);
      } else {
        homePageContent = '';
      }
    } catch (_) {
      homePageContent = homePageContent || '';
    } finally {
      homePageContentLoaded = true;
    }
  }

  async function loadNotice() {
    const today = new Date().toDateString();
    const lastCloseDate = localStorage.getItem('notice_close_date');
    if (lastCloseDate === today) return;

    try {
      const res = await apiGet('/api/notice');
      if (res?.success && String(res.data || '').trim() !== '') {
        noticeContent = String(res.data);
        noticeVisible = true;
      }
    } catch (_) {
      // ignore notice load errors
    }
  }

  function closeNotice() {
    noticeVisible = false;
    localStorage.setItem('notice_close_date', new Date().toDateString());
  }

  async function copyBaseUrl() {
    await navigator.clipboard.writeText(apiBaseUrl);
    copiedBase = true;
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedBase = false;
    }, 2000);
  }

  function goGetKey() {
    if (hasSession) {
      goto('/dashboard');
      return;
    }
    goto('/login');
  }

  onMount(async () => {
    await Promise.all([loadStatus(), loadHomePageContent(), loadNotice()]);
  });

  onDestroy(() => {
    if (copyResetTimer) clearTimeout(copyResetTimer);
  });
</script>

<div class="page-wrap w-full min-w-0">
  <Dialog.Root bind:open={noticeVisible}>
    <Dialog.Content class="max-w-lg">
      <Dialog.Header>
        <Dialog.Title>公告</Dialog.Title>
      </Dialog.Header>
      <div class="text-sm whitespace-pre-wrap">{noticeContent || '暂无公告内容'}</div>
      <Dialog.Footer>
        <Button onclick={closeNotice}>知道了</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>

  {#if homePageContentLoaded && !homePageContent}
    <div class="w-full min-w-0">
      <div class="home-landing flex w-full min-w-0 flex-col">
        <section
          class="home-landing__panel w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-neutral-50 p-5 text-center shadow-sm md:p-8 dark:border-zinc-700 dark:bg-zinc-950/70"
        >
          <p class="text-xs font-semibold tracking-wide text-muted-foreground">领先的AI模型兼容接口</p>
          <h1 class="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            一站聚合，极速中转
          </h1>
          <p class="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
            一键聚合多家上游供应商，成本更可预期，只需把 Base URL 设为
          </p>
          <button
            type="button"
            class="home-landing__url-copy group mt-10 flex w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/30 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-muted/25"
            aria-label={copiedBase ? '基址已复制到剪贴板' : '点击复制 Base URL'}
            onclick={copyBaseUrl}
          >
            <div class="min-w-0 flex-1 px-4 py-4 text-left sm:px-5 sm:py-4">
              <span class="mb-1.5 block text-xs font-medium text-muted-foreground">Base URL</span>
              <code class="block break-all font-mono text-sm text-foreground sm:text-base">{apiBaseUrl}</code>
            </div>
            <div
              class="flex shrink-0 items-center gap-2 border-l border-border bg-muted/25 px-4 py-3 text-sm font-medium text-muted-foreground group-hover:bg-muted/40 sm:px-5"
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

          <div class="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Button
              class="h-11 min-h-11 px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base"
              onclick={goGetKey}
            >
              获取密钥
            </Button>
            <Button
              variant="outline"
              class="h-11 min-h-11 px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base"
              onclick={() => goto('/docs')}
            >
              查看教程
            </Button>
            {#if isDemoSiteMode && status?.version}
              <Button variant="outline" onclick={() => window.open('https://github.com/QuantumNous/new-api', '_blank')}>
                {status.version}
              </Button>
            {/if}
          </div>

          <div class="mt-10">
            <p class="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              常用接口示例（完整 URL）
            </p>
            <ul class="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
              {#each API_EXAMPLES as item}
                <li class="m-0 min-w-0 rounded-lg border border-border bg-muted/30 p-4 text-left">
                  <span class="mb-1 block text-xs font-medium text-muted-foreground">{item.label}</span>
                  <code class="block break-all font-mono text-sm text-foreground">{exampleFullUrl(item)}</code>
                </li>
              {/each}
            </ul>
          </div>

          <div class="home-landing__providers">
            <div class="home-landing__providers-rule" aria-hidden="true"></div>
            <div class="pt-10">
              <p class="mb-5 text-sm font-medium text-foreground">支持 300+ 模型 API</p>
              <div
                class="home-provider-strip mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-3.5 rounded-xl border border-border bg-muted/20 px-5 py-4 leading-none sm:max-w-3xl md:gap-5 md:px-6 md:py-5"
              >
                {#each PROVIDER_LOGOS as p}
                  <img
                    src={`https://models.dev/logos/${p.id}.svg`}
                    alt={p.alt}
                    class="home-provider-icon"
                    width="32"
                    height="32"
                    loading="lazy"
                    decoding="async"
                  />
                {/each}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  {:else if homePageContent.startsWith('https://')}
    <iframe
      title="home-page-content"
      src={homePageContent}
      style="width:100%;height:calc(100dvh - var(--app-main-padding-top, 4.5rem));border:none;"
    ></iframe>
  {:else}
    <div class="panel p-4 prose dark:prose-invert max-w-none">
      {@html homePageContent}
    </div>
  {/if}
</div>

<style>
  /** 与卡片左右 padding 对消，分割线横向贯通主卡片内容区 */
  .home-landing__providers {
    margin-top: 3rem;
  }

  .home-landing__providers-rule {
    margin-left: -1.25rem;
    margin-right: -1.25rem;
    border-top: 1px solid var(--border);
  }

  @media (min-width: 768px) {
    .home-landing__providers-rule {
      margin-left: -2rem;
      margin-right: -2rem;
    }
  }

  /** models.dev SVG：contain 防止 viewBox 留白导致裁切；leading-none 消除行内基线空隙 */
  .home-provider-strip {
    row-gap: 1rem;
  }

  .home-provider-icon {
    display: block;
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    object-fit: contain;
    object-position: center;
    opacity: 0.92;
    filter: brightness(0);
  }

  :global(html.dark) .home-provider-icon {
    filter: brightness(0) invert(1);
  }
</style>

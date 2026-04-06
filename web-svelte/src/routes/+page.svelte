<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { goto } from '$app/navigation';
  import { apiGet } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';

  const API_ENDPOINTS = [
    '/v1/chat/completions',
    '/v1/responses',
    '/v1/responses/compact',
    '/v1/messages',
    '/v1beta/models',
    '/v1/embeddings',
    '/v1/rerank',
    '/v1/images/generations',
    '/v1/images/edits',
    '/v1/images/variations',
    '/v1/audio/speech',
    '/v1/audio/transcriptions',
    '/v1/audio/translations'
  ];

  let status = {};
  let homePageContentLoaded = false;
  let homePageContent = '';
  let endpointIndex = 0;
  let noticeVisible = false;
  let noticeContent = '';

  $: serverAddress = status?.server_address || window.location.origin;
  $: currentEndpoint = API_ENDPOINTS[endpointIndex] || API_ENDPOINTS[0];
  $: isDemoSiteMode = Boolean(status?.demo_site_enabled);

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
    await navigator.clipboard.writeText(serverAddress);
  }

  onMount(async () => {
    await Promise.all([loadStatus(), loadHomePageContent(), loadNotice()]);
    const timer = setInterval(() => {
      endpointIndex = (endpointIndex + 1) % API_ENDPOINTS.length;
    }, 3000);
    return () => clearInterval(timer);
  });
</script>

<div class="w-full overflow-x-hidden">
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
    <div class="page-wrap">
      <section class="panel p-6 md:p-10">
        <div class="max-w-4xl mx-auto text-center">
          <h1 class="text-4xl md:text-5xl font-bold tracking-wide">
            一站聚合，极速中转
          </h1>
          <p class="mt-4 text-sm md:text-base opacity-80">
            更好的价格，更好的稳定性，只需要将模型基址替换为：
          </p>

          <div class="mt-6 flex flex-col md:flex-row items-center justify-center gap-3">
            <div class="auth-input w-full md:max-w-xl text-left">
              <span class="text-sm">{serverAddress}</span>
            </div>
            <div class="auth-input w-full md:w-auto text-left min-w-52">
              <span class="text-sm">{currentEndpoint}</span>
            </div>
            <Button variant="outline" onclick={copyBaseUrl}>复制基址</Button>
          </div>

          <div class="mt-6 flex items-center justify-center gap-3">
            <Button onclick={() => goto('/apikeys')}>获取密钥</Button>
            {#if isDemoSiteMode && status?.version}
              <Button variant="outline" onclick={() => window.open('https://github.com/QuantumNous/new-api', '_blank')}>
                {status.version}
              </Button>
            {/if}
          </div>

          <div class="mt-10">
            <p class="text-sm opacity-70 mb-3">支持众多的大模型供应商</p>
            <div class="flex flex-wrap items-center justify-center gap-3 md:gap-4">
              <img src="https://cdn.simpleicons.org/openai/000000" alt="OpenAI" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/anthropic/000000" alt="Claude" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/googlegemini/000000" alt="Gemini" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/alibabacloud/000000" alt="Qwen" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/tencentqq/000000" alt="Tencent" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/microsoftazure/000000" alt="Azure" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/huggingface/000000" alt="HuggingFace" class="h-6 w-6 opacity-90 dark:invert" />
              <img src="https://cdn.simpleicons.org/cohere/000000" alt="Cohere" class="h-6 w-6 opacity-90 dark:invert" />
              <span class="text-lg font-semibold opacity-80">30+</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  {:else if homePageContent.startsWith('https://')}
    <iframe
      title="home-page-content"
      src={homePageContent}
      style="width:100%;height:calc(100dvh - var(--app-header-height, 3.5rem));border:none;"
    ></iframe>
  {:else}
    <div class="page-wrap">
      <div class="panel p-4 prose dark:prose-invert max-w-none">
        {@html homePageContent}
      </div>
    </div>
  {/if}
</div>

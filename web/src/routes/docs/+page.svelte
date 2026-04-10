<svelte:options runes={false} />

<script>
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import { apiGet, apiPost } from '$lib/api';
  import { copy } from '$lib/dashboard/helpers.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';
  import * as Select from '$lib/components/ui/select';
  import { Code, Copy, CheckCircle, TerminalWindow } from 'phosphor-svelte';

  const CLIENT_OPTIONS = [
    { value: 'claude_code', label: 'Claude Code' },
    { value: 'openclaw', label: 'OpenClaw' }
  ];

  /** @type {{ value: string; label: string }[]} */
  const PLATFORM_OPTIONS = [
    { value: 'unix', label: 'macOS / Linux / Git Bash' },
    { value: 'windows', label: 'Windows（CMD / PowerShell）' }
  ];

  let aboutLoading = true;
  let errorMsg = '';
  let iframeUrl = '';
  let htmlContent = '';

  let modelLoading = false;
  /** @type {string[]} */
  let pricingModels = [];
  let selectedModel = '';
  /** @type {'claude_code' | 'openclaw'} */
  let selectedClient = 'claude_code';
  /** @type {'unix' | 'windows'} */
  let selectedPlatform = 'unix';

  let tokensLoading = false;
  /** @type {{ id: number; name?: string; key?: string }[]} */
  let userTokens = [];
  /** 当前选中的令牌 id（字符串，与 Select 一致） */
  let selectedTokenId = '';
  /** 一次性短链兑换 URL（仅路径段为随机码，不含密钥） */
  let oneTimeRedeemUrl = '';
  let creatingOneTimeLink = false;
  /** 复制 curl 后短暂冷却，避免连点 */
  let copyCurlCooldown = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let copyCurlCooldownTimer;
  /** 并发/过时请求丢弃 */
  let agentLinkReqId = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let agentLinkDebounceTimer;

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

  $: hasUserSession = typeof window !== 'undefined' && !!localStorage.getItem('user');

  /** bash：单引号包裹 URL */
  /** @param {string} s */
  function shSingleQuote(s) {
    return `'${String(s).replace(/'/g, `'\\''`)}'`;
  }

  /**
   * Windows CMD / PowerShell：URL 用双引号。
   * cmd.exe 不把单引号当作引号，会把 `'` 传给 curl 导致 URL 非法（常见 curl error 3）。
   */
  /** @param {string} s */
  function winCmdDoubleQuote(s) {
    return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  /** 与「操作系统」选择一致；兑换内容仍为 bash 脚本，需本机有 bash */
  $: oneTimeCommandBlock = (() => {
    if (!oneTimeRedeemUrl) return '';
    const q =
      selectedPlatform === 'windows'
        ? winCmdDoubleQuote(oneTimeRedeemUrl)
        : shSingleQuote(oneTimeRedeemUrl);
    const curlBin = selectedPlatform === 'windows' ? 'curl.exe' : 'curl';
    return `${curlBin} -fsSL ${q} | bash`;
  })();

  function scheduleAgentEnvLink() {
    if (typeof window === 'undefined') return;
    if (
      !hasUserSession ||
      !selectedTokenId ||
      tokensLoading ||
      userTokens.length === 0
    ) {
      return;
    }
    if (agentLinkDebounceTimer) clearTimeout(agentLinkDebounceTimer);
    agentLinkDebounceTimer = setTimeout(() => {
      agentLinkDebounceTimer = undefined;
      requestAgentEnvLink();
    }, 320);
  }

  async function requestAgentEnvLink() {
    if (
      !hasUserSession ||
      !selectedTokenId ||
      tokensLoading ||
      userTokens.length === 0
    ) {
      oneTimeRedeemUrl = '';
      return;
    }
    const reqId = ++agentLinkReqId;
    creatingOneTimeLink = true;
    try {
      const res = await apiPost('/api/user/docs/agent-env-link', {
        token_id: Number(selectedTokenId),
        client: selectedClient,
        model: selectedModel || '',
        platform: selectedPlatform
      });
      if (reqId !== agentLinkReqId) return;
      if (!res?.success) {
        oneTimeRedeemUrl = '';
        showError(res?.message || '生成短链失败');
        return;
      }
      const url = res?.data?.redeem_url;
      if (!url || typeof url !== 'string') {
        oneTimeRedeemUrl = '';
        showError('未返回兑换地址');
        return;
      }
      oneTimeRedeemUrl = url;
    } catch (_) {
      if (reqId !== agentLinkReqId) return;
      oneTimeRedeemUrl = '';
      showError('生成短链失败');
    } finally {
      if (reqId === agentLinkReqId) creatingOneTimeLink = false;
    }
  }

  /** 不可生成时清空（勿与下方 schedule 混在同一 $: 内，否则会随 userTokens 等引用反复触发） */
  $: if (typeof window !== 'undefined') {
    hasUserSession;
    selectedTokenId;
    tokensLoading;
    userTokens.length;
    if (!hasUserSession || !selectedTokenId || tokensLoading || userTokens.length === 0) {
      agentLinkReqId++;
      if (agentLinkDebounceTimer) clearTimeout(agentLinkDebounceTimer);
      agentLinkDebounceTimer = undefined;
      oneTimeRedeemUrl = '';
      creatingOneTimeLink = false;
    }
  }

  /** 仅随选项与登录/加载状态变化而调度；不依赖「聚合布尔」以免多余失效 */
  $: if (typeof window !== 'undefined') {
    selectedModel;
    selectedTokenId;
    selectedClient;
    selectedPlatform;
    hasUserSession;
    tokensLoading;
    if (hasUserSession && selectedTokenId && !tokensLoading) {
      scheduleAgentEnvLink();
    }
  }

  /**
   * @param {string} idStr
   */
  function tokenTriggerLabel(idStr) {
    const t = userTokens.find((x) => String(x.id) === idStr);
    return t ? `${t.name || '未命名'} · ${t.key || ''}` : '选择令牌';
  }

  async function loadUserTokens() {
    tokensLoading = true;
    userTokens = [];
    if (typeof window === 'undefined' || !localStorage.getItem('user')) {
      tokensLoading = false;
      return;
    }
    try {
      const res = await apiGet('/api/token/?p=1&size=100');
      if (res?.success && res.data) {
        const data = res.data;
        const items = Array.isArray(data) ? data : data?.items || [];
        userTokens = items;
        const ids = new Set(userTokens.map((t) => String(t.id)));
        if (selectedTokenId && !ids.has(selectedTokenId)) {
          selectedTokenId = '';
        }
        if (!selectedTokenId && userTokens.length > 0) {
          selectedTokenId = String(userTokens[0].id);
        }
      }
    } catch (_) {
      userTokens = [];
    } finally {
      tokensLoading = false;
    }
  }

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

  async function loadPricingModels() {
    modelLoading = true;
    try {
      const res = await apiGet('/api/pricing');
      if (res?.success && Array.isArray(res.data)) {
        const names = [
          ...new Set(
            res.data.map((/** @type {{ model_name?: string }} */ m) => m.model_name).filter(Boolean)
          )
        ].sort();
        pricingModels = /** @type {string[]} */ (names);
        if (selectedModel && !pricingModels.includes(selectedModel)) {
          selectedModel = pricingModels[0] ?? '';
        } else if (!selectedModel && pricingModels.length > 0) {
          selectedModel = pricingModels[0];
        }
      } else {
        pricingModels = [];
      }
    } catch (_) {
      pricingModels = [];
    } finally {
      modelLoading = false;
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

  async function copyOneTimeCurl() {
    if (!oneTimeCommandBlock || copyCurlCooldown) return;
    const ok = await copy(oneTimeCommandBlock);
    if (ok) {
      showSuccess('已复制命令');
      copyCurlCooldown = true;
      if (copyCurlCooldownTimer) clearTimeout(copyCurlCooldownTimer);
      copyCurlCooldownTimer = setTimeout(() => {
        copyCurlCooldown = false;
      }, 2000);
    }
  }

  function guessDefaultPlatform() {
    if (typeof navigator === 'undefined') return 'unix';
    const p = navigator.platform || '';
    const ua = navigator.userAgent || '';
    if (/Win/i.test(p) || /Windows/i.test(ua)) return 'windows';
    return 'unix';
  }

  onMount(async () => {
    selectedPlatform = /** @type {'unix' | 'windows'} */ (guessDefaultPlatform());
    await Promise.all([loadStatus(), loadDocs(), loadPricingModels(), loadUserTokens()]);
  });

  onDestroy(() => {
    if (agentLinkDebounceTimer) clearTimeout(agentLinkDebounceTimer);
    if (copyCurlCooldownTimer) clearTimeout(copyCurlCooldownTimer);
  });
</script>

<div class="docs-page page-wrap flex min-h-0 flex-1 flex-col overflow-hidden">
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-sm dark:border-zinc-700"
  >
    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-50 dark:bg-zinc-950/70"
    >
      <div
        class="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch"
      >
        <section
          class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b border-gray-200 p-4 md:p-6 lg:border-b-0 lg:border-r lg:pr-6 dark:border-zinc-700"
        >
          <h2
            class="mb-4 flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground md:text-xl"
          >
            <TerminalWindow class="h-5 w-5 shrink-0 opacity-85 md:h-6 md:w-6" weight="duotone" />
            配置 OpenClaw / Claude Code
          </h2>
          <p class="mb-4 shrink-0 text-sm text-muted-foreground">
            在本页登录后选择<strong class="font-medium text-foreground">操作系统</strong>、模型、客户端与 API
            令牌；切换任一项时会自动生成新的一次性短链。下方命令与所选系统一致；脚本由服务端返回，<strong
              class="font-medium text-foreground">首次</strong
            >成功拉取后链接作废；URL 仅含随机码，不含密钥。
          </p>

          <div
            class="mb-4 shrink-0 space-y-3 rounded-lg border border-border bg-background/50 p-3 dark:bg-zinc-900/40"
          >
            <div class="flex flex-col gap-4">
              <div class="min-w-0 w-full">
                <span class="mb-1.5 block text-xs text-muted-foreground">操作系统</span>
                <Select.Root type="single" bind:value={selectedPlatform}>
                  <Select.Trigger
                    aria-label="操作系统"
                    class="!h-8 min-h-8 w-full !bg-background hover:!bg-muted dark:!bg-background dark:hover:!bg-muted"
                  >
                    <span class="truncate text-left text-xs">
                      {PLATFORM_OPTIONS.find((p) => p.value === selectedPlatform)?.label ??
                        selectedPlatform}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each PLATFORM_OPTIONS as p}
                      <Select.Item value={p.value} label={p.label}>{p.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="min-w-0 w-full">
                <span class="mb-1.5 block text-xs text-muted-foreground">模型</span>
                <Select.Root
                  type="single"
                  bind:value={selectedModel}
                  disabled={modelLoading || pricingModels.length === 0}
                >
                  <Select.Trigger
                    aria-label="模型"
                    class="!h-8 min-h-8 w-full !bg-background hover:!bg-muted dark:!bg-background dark:hover:!bg-muted"
                  >
                    <span class="truncate text-left text-xs"
                      >{selectedModel ||
                        (pricingModels.length === 0 ? '暂无模型' : '选择模型')}</span
                    >
                  </Select.Trigger>
                  <Select.Content>
                    {#each pricingModels as m}
                      <Select.Item value={m} label={m}>{m}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="min-w-0 w-full">
                <span class="mb-1.5 block text-xs text-muted-foreground">Agent 客户端</span>
                <Select.Root type="single" bind:value={selectedClient}>
                  <Select.Trigger
                    aria-label="Agent 客户端"
                    class="!h-8 min-h-8 w-full !bg-background hover:!bg-muted dark:!bg-background dark:hover:!bg-muted"
                  >
                    <span class="truncate text-left text-xs">
                      {CLIENT_OPTIONS.find((c) => c.value === selectedClient)?.label ??
                        selectedClient}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each CLIENT_OPTIONS as c}
                      <Select.Item value={c.value} label={c.label}>{c.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="min-w-0 w-full">
                <span class="mb-1.5 block text-xs text-muted-foreground">API 令牌</span>
                <Select.Root
                  type="single"
                  bind:value={selectedTokenId}
                  disabled={tokensLoading || !hasUserSession || userTokens.length === 0}
                >
                  <Select.Trigger
                    aria-label="API 令牌"
                    class="!h-8 min-h-8 w-full !bg-background hover:!bg-muted dark:!bg-background dark:hover:!bg-muted"
                  >
                    <span class="truncate text-left text-xs">
                      {#if !hasUserSession}
                        请先登录
                      {:else if tokensLoading}
                        加载中…
                      {:else if userTokens.length === 0}
                        无可用令牌
                      {:else}
                        {tokenTriggerLabel(selectedTokenId)}
                      {/if}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each userTokens as t}
                      <Select.Item value={String(t.id)} label={`${t.name || '未命名'} · ${t.key || ''}`}>
                        {t.name || '未命名'}
                        <span class="text-muted-foreground"> · {t.key || ''}</span>
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            </div>

            {#if creatingOneTimeLink}
              <p class="text-[11px] text-muted-foreground">正在生成短链…</p>
            {/if}
            <div
              class="flex w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/25 text-left dark:bg-muted/15"
            >
              <div class="flex min-h-0 min-w-0 flex-1 flex-col justify-center p-2.5">
                <pre
                  class="box-border h-10 max-h-10 min-h-10 w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-foreground sm:text-xs"
                >{#if oneTimeCommandBlock}{oneTimeCommandBlock}{:else}<span class="select-none text-muted-foreground/35">—</span>{/if}</pre>
              </div>
              <button
                type="button"
                class="flex min-w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 self-stretch border-l border-border bg-muted/35 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[5.25rem] sm:px-3 sm:text-xs"
                disabled={copyCurlCooldown || !oneTimeCommandBlock}
                onclick={copyOneTimeCurl}
              >
                <Copy class="size-3.5 shrink-0 opacity-80 sm:size-4" />
                <span class="whitespace-nowrap">复制</span>
              </button>
            </div>
            <p class="text-[11px] leading-snug text-muted-foreground">
              兑换内容为 <strong class="font-medium text-foreground">bash</strong> 脚本，需本机有
              <code class="rounded bg-muted px-1 py-0.5 text-[10px]">bash</code>（Windows 可选 Git Bash / 安装 Git
              后的 PATH）。执行成功后，会为所选客户端<strong class="font-medium text-foreground">自动配置 API 密钥</strong>。
            </p>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {#if aboutLoading}
              <div class="text-sm opacity-70">加载中...</div>
            {:else if errorMsg}
              <div class="text-sm text-red-500">{errorMsg}</div>
            {:else if iframeUrl}
              <div
                class="h-full min-h-0 w-full overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-700"
              >
                <iframe title="文档" src={iframeUrl} class="block h-full min-h-0 w-full border-0"></iframe>
              </div>
              <div
                class="docs-dynamic prose prose-neutral max-w-none dark:prose-invert md:prose-sm"
              >
                {@html htmlContent}
              </div>
            {/if}
          </div>
        </section>

        <section class="flex min-h-0 min-w-0 flex-1 flex-col p-4 md:p-6 lg:pl-6">
          <h2
            class="mb-4 flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground md:text-xl"
          >
            <Code class="h-5 w-5 shrink-0 opacity-85 md:h-6 md:w-6" weight="duotone" />
            使用 API 开发应用
          </h2>
          <p class="mb-4 text-sm text-muted-foreground">
            在自有服务、脚本或移动端中调用本站；请求格式与 OpenAI 兼容 API 一致，使用控制台中的令牌作为
            <code class="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer</code>。
          </p>
          {#if apiBaseUrl}
            <button
              type="button"
              class="group flex w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/30 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-muted/25"
              aria-label={copiedBase ? '基址已复制到剪贴板' : '点击复制 Base URL'}
              onclick={copyApiBase}
            >
              <div class="flex min-w-0 flex-1 items-center px-3 py-2 text-left sm:px-4">
                <code class="block w-full break-all font-mono text-sm leading-snug text-foreground">{apiBaseUrl}</code>
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
          <ul class="mt-4 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
            <li>将 Base URL 设为上述地址（通常以 <code class="text-xs">/v1</code> 结尾）。</li>
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
</style>

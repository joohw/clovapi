<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet, getUserIdFromLocalStorage, apiUrl } from '$lib/api';

  const PG_SESSION_VER = 1;
  /** 同标签页内临时保存，关闭标签即清除；按用户区分避免串数据 */
  function playgroundStorageKey() {
    return `newapi_playground_v${PG_SESSION_VER}_${getUserIdFromLocalStorage()}`;
  }

  /** @param {unknown} v */
  function isMessageList(v) {
    if (!Array.isArray(v)) return false;
    return v.every(
      (m) =>
        m &&
        typeof m === 'object' &&
        typeof /** @type {{ role?: unknown; content?: unknown }} */ (m).role === 'string' &&
        typeof /** @type {{ role?: unknown; content?: unknown }} */ (m).content === 'string'
    );
  }

  function loadPlaygroundSession() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(playgroundStorageKey());
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.v !== PG_SESSION_VER) return;
      if (isMessageList(data.messages)) {
        messages = /** @type {{ role: string; content: string }[]} */ (data.messages);
      }
      if (typeof data.prompt === 'string') prompt = data.prompt;
      if (typeof data.stream === 'boolean') stream = data.stream;
      if (typeof data.model === 'string' && models.includes(data.model)) {
        model = data.model;
      }
      if (
        typeof data.group === 'string' &&
        groupOptions.some((g) => g.value === data.group)
      ) {
        group = data.group;
      }
    } catch (_) {
      // ignore corrupt storage
    }
  }

  function savePlaygroundSession() {
    if (typeof sessionStorage === 'undefined' || !persistReady) return;
    try {
      sessionStorage.setItem(
        playgroundStorageKey(),
        JSON.stringify({
          v: PG_SESSION_VER,
          messages,
          prompt,
          model,
          group,
          stream
        })
      );
    } catch (_) {
      // quota / private mode
    }
  }

  /** 恢复完成后再写入，避免把空状态盖掉已保存内容 */
  let persistReady = false;
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import * as Select from '$lib/components/ui/select';
  import * as Switch from '$lib/components/ui/switch';

  let loadingModels = true;
  let sending = false;
  let errorMsg = '';
  /** @type {string[]} */
  let models = [];
  /** @type {Record<string, any>} */
  let modelSpecById = {};
  /** @type {{ value: string; label: string }[]} */
  let groupOptions = [];
  let model = '';
  let group = '';
  let stream = true;
  let selectedModelSpec = null;
  let modelStreamSupported = true;

  let prompt = '';
  /** @type {{ role: string; content: string }[]} */
  let messages = [];

  /**
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
   * @param {any} spec
   */
  function isModelStreamSupported(spec) {
    if (!spec || typeof spec !== 'object') return true;
    // Trust explicit flags only; unknown means keep enabled.
    if (typeof spec.stream === 'boolean') return spec.stream;
    if (typeof spec.streaming === 'boolean') return spec.streaming;
    if (typeof spec.sse === 'boolean') return spec.sse;
    return true;
  }

  /**
   * @param {Record<string, { desc?: string }>} data
   * @param {string | undefined} userGroup
   */
  function processGroups(data, userGroup) {
    const entries = Object.entries(data || {}).map(([g, info]) => ({
      value: g,
      label:
        info?.desc && info.desc.length > 20 ? info.desc.slice(0, 20) + '...' : info?.desc || g
    }));
    if (entries.length === 0) {
      return [{ value: '', label: '用户分组' }];
    }
    if (userGroup) {
      const i = entries.findIndex((x) => x.value === userGroup);
      if (i > 0) {
        const [pick] = entries.splice(i, 1);
        entries.unshift(pick);
      }
    }
    return entries;
  }

  /**
   * @param {{ role: string; content: string }[]} chatMessages
   */
  function buildPayload(chatMessages) {
    /** @type {{ role: string; content: string }[]} */
    const out = [];
    for (const m of chatMessages) {
      if (m.role && m.content != null && String(m.content).trim() !== '') {
        out.push({ role: m.role, content: String(m.content).trim() });
      }
    }

    return {
      model,
      group: group ?? '',
      messages: out,
      stream
    };
  }

  async function loadModels() {
    loadingModels = true;
    errorMsg = '';
    try {
      const [res, apiSpecPayload, apiExSpecPayload] = await Promise.all([
        apiGet('/api/user/models'),
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
        /** @type {Record<string, any>} */
        const index = {};
        mergeModelSpecIndex(index, apiExSpecPayload, false);
        mergeModelSpecIndex(index, apiSpecPayload, true);
        modelSpecById = index;
        models = Array.isArray(res.data) ? res.data : [];
        if (!model && models.length > 0) {
          model = models[0];
        }
      } else {
        errorMsg = res?.message || '加载模型失败';
      }
    } catch (err) {
      errorMsg = '加载模型失败';
    } finally {
      loadingModels = false;
    }
  }

  async function loadGroups() {
    try {
      const res = await apiGet('/api/user/self/groups');
      if (res?.success && res.data && typeof res.data === 'object') {
        let userGroup;
        try {
          const raw = localStorage.getItem('user');
          if (raw) userGroup = JSON.parse(raw)?.group;
        } catch (_) {}
        groupOptions = processGroups(/** @type {Record<string, { desc?: string }>} */ (res.data), userGroup);
        const has = groupOptions.some((g) => g.value === group);
        if (!has) {
          group = groupOptions[0]?.value ?? '';
        }
      }
    } catch (_) {
      groupOptions = [{ value: '', label: '用户分组' }];
    }
  }

  /**
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {Record<string, unknown>} body
   * @param {(s: string) => void} onDelta
   */
  async function readSseChat(url, headers, body, onDelta) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch (_) {}
      throw new Error(text || `请求失败 (${res.status})`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('无法读取流式响应');
    const dec = new TextDecoder();
    let carry = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += dec.decode(value, { stream: true });
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta =
            j.choices?.[0]?.delta?.content ??
            j.choices?.[0]?.message?.content ??
            '';
          if (delta) onDelta(delta);
        } catch (_) {}
      }
    }
    const last = carry.trim();
    if (last.startsWith('data:')) {
      const data = last.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content ?? '';
          if (delta) onDelta(delta);
        } catch (_) {}
      }
    }
  }

  /**
   * @param {SubmitEvent} event
   */
  async function sendMessage(event) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !model) return;

    const userMsg = { role: 'user', content: trimmedPrompt };
    const requestMessages = [...messages, userMsg];
    // Clear input immediately after submit.
    prompt = '';
    sending = true;
    errorMsg = '';

    const payload = buildPayload(requestMessages);

    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'New-Api-User': getUserIdFromLocalStorage()
    };

    try {
      if (stream) {
        let acc = '';
        messages = [...requestMessages, { role: 'assistant', content: '' }];
        await readSseChat(apiUrl('/pg/chat/completions'), headers, payload, (chunk) => {
          acc += chunk;
          messages = [...requestMessages, { role: 'assistant', content: acc }];
        });
        if (!acc.trim()) {
          messages = [...requestMessages, { role: 'assistant', content: '无返回内容' }];
        }
      } else {
        messages = [...requestMessages, { role: 'assistant', content: '...' }];
        const res = await fetch(apiUrl('/pg/chat/completions'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errText = data?.error?.message || data?.message || JSON.stringify(data);
          throw new Error(errText || `请求失败 (${res.status})`);
        }
        const assistant = data?.choices?.[0]?.message?.content || '无返回内容';
        messages = [...requestMessages, { role: 'assistant', content: assistant }];
      }
      prompt = '';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : '发送失败，请重试';
      messages = [...requestMessages, { role: 'assistant', content: '请求失败' }];
    } finally {
      sending = false;
    }
  }

  function clearMessages() {
    messages = [];
    errorMsg = '';
  }

  $: if (persistReady) {
    void messages;
    void prompt;
    void model;
    void group;
    void stream;
    savePlaygroundSession();
  }

  $: selectedModelSpec = findModelSpec(model, modelSpecById);
  $: modelStreamSupported = isModelStreamSupported(selectedModelSpec);
  $: if (!modelStreamSupported && stream) {
    stream = false;
  }

  onMount(async () => {
    await Promise.all([loadModels(), loadGroups()]);
    loadPlaygroundSession();
    persistReady = true;
  });
</script>

<div class="playground-page page-wrap flex min-h-0 flex-1 flex-col overflow-hidden">
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-sm dark:border-zinc-700"
  >
    <ScrollArea
      class="h-0 min-h-0 flex-1 bg-neutral-50 dark:bg-zinc-950/70"
      orientation="vertical"
    >
      <div class="w-full space-y-3 px-3 py-3">
        {#if messages.length === 0}
          <div class="text-sm text-muted-foreground">发送第一条消息开始对话。</div>
        {:else}
          {#each messages as msg, idx}
            <div>
              <div class="mb-0.5 text-xs text-muted-foreground">{msg.role === 'user' ? '你' : '助手'}</div>
              {#if msg.role === 'assistant' && sending && idx === messages.length - 1}
                <pre class="whitespace-pre-wrap break-words text-sm font-sans"
                  >{msg.content}<span
                    class="mr-1 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-current align-middle"
                    aria-hidden="true"
                  ></span></pre
                >
              {:else}
                <pre class="whitespace-pre-wrap break-words text-sm font-sans">{msg.content}</pre>
              {/if}
            </div>
          {/each}
        {/if}
        {#if errorMsg}
          <p class="text-sm text-destructive">{errorMsg}</p>
        {/if}
        <div class="h-20" aria-hidden="true"></div>
      </div>
    </ScrollArea>

    <form
      class="shrink-0 border-t border-gray-200 bg-card px-3 py-3 dark:border-zinc-700"
      onsubmit={sendMessage}
    >
      <div class="w-full space-y-1.5">
        <Textarea
          bind:value={prompt}
          placeholder="输入消息..."
          class="max-h-48 min-h-14 resize-none overflow-y-auto border-0 bg-transparent px-0 py-1.5 shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
        />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="min-w-0 w-full max-w-sm">
            <Select.Root type="single" bind:value={model} disabled={loadingModels || models.length === 0}>
              <Select.Trigger
                id="pg-model-select"
                aria-label="模型"
                class="!h-8 min-h-8 min-w-0 w-full max-w-full !bg-background hover:!bg-muted dark:!bg-background dark:hover:!bg-muted"
              >
                <span class="truncate text-left"
                  >{model || (models.length === 0 ? '暂无模型' : '选择模型')}</span
                >
              </Select.Trigger>
              <Select.Content>
                {#each models as m}
                  <Select.Item value={m} label={m}>{m}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            </div>
            <div class="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <Switch.Root bind:checked={stream} disabled={!modelStreamSupported || sending} />
              <span>流式输出</span>
              {#if !modelStreamSupported}
                <span>（当前模型不支持）</span>
              {/if}
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button variant="outline" type="button" onclick={clearMessages}>
              清空对话
            </Button>
            <Button type="submit" disabled={sending || !model}>
              {sending ? '发送中...' : '发送'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  </div>
</div>

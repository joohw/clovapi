<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { apiGet, getUserIdFromLocalStorage, apiUrl } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import * as Sheet from '$lib/components/ui/sheet';
  import PlaygroundParamsFields from '$lib/components/playground/PlaygroundParamsFields.svelte';

  let loadingModels = true;
  let loadingGroups = true;
  let sending = false;
  let errorMsg = '';
  /** @type {string[]} */
  let models = [];
  /** @type {{ value: string; label: string }[]} */
  let groupOptions = [];
  let model = '';
  let group = '';
  let systemPrompt = '';
  let stream = true;

  let temperature = 0.7;
  let topP = 1;
  let maxTokens = 4096;
  let frequencyPenalty = 0;
  let presencePenalty = 0;
  /** @type {string} */
  let seedStr = '';

  /** @type {Record<string, boolean>} */
  let parameterEnabled = {
    temperature: true,
    top_p: true,
    max_tokens: false,
    frequency_penalty: true,
    presence_penalty: true,
    seed: false
  };

  let prompt = '';
  /** @type {{ role: string; content: string }[]} */
  let messages = [];

  let paramsSheetOpen = false;

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
   * @param {string} sys
   * @param {Record<string, unknown>} ins
   * @param {Record<string, boolean>} enabled
   */
  function buildPayload(chatMessages, sys, ins, enabled) {
    /** @type {{ role: string; content: string }[]} */
    const out = [];
    if (sys && sys.trim()) {
      out.push({ role: 'system', content: sys.trim() });
    }
    for (const m of chatMessages) {
      if (m.role && m.content != null && String(m.content).trim() !== '') {
        out.push({ role: m.role, content: String(m.content).trim() });
      }
    }

    /** @type {Record<string, unknown>} */
    const payload = {
      model: ins.model,
      group: ins.group ?? '',
      messages: out,
      stream: ins.stream
    };

    const map = [
      ['temperature', 'temperature'],
      ['top_p', 'top_p'],
      ['max_tokens', 'max_tokens'],
      ['frequency_penalty', 'frequency_penalty'],
      ['presence_penalty', 'presence_penalty'],
      ['seed', 'seed']
    ];
    for (const [key, param] of map) {
      if (!enabled[key]) continue;
      const v = ins[param];
      const has =
        v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));
      if (has) {
        payload[param] = typeof v === 'number' ? v : Number(v);
      }
    }

    return payload;
  }

  async function loadModels() {
    loadingModels = true;
    errorMsg = '';
    try {
      const res = await apiGet('/api/user/models');
      if (res?.success) {
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
    loadingGroups = true;
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
    } finally {
      loadingGroups = false;
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
    if (!prompt.trim() || !model) return;

    const userMsg = { role: 'user', content: prompt.trim() };
    const requestMessages = [...messages, userMsg];
    const currentPrompt = prompt.trim();
    sending = true;
    errorMsg = '';
    paramsSheetOpen = false;

    const ins = {
      model,
      group,
      stream,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed: seedStr.trim() === '' ? null : Number(seedStr)
    };

    const payload = buildPayload(requestMessages, systemPrompt, ins, parameterEnabled);

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
      prompt = currentPrompt;
    } finally {
      sending = false;
    }
  }

  function clearMessages() {
    messages = [];
    errorMsg = '';
  }

  onMount(() => {
    loadModels();
    loadGroups();
  });
</script>

<div class="playground-page page-wrap flex min-h-0 flex-1 flex-col overflow-hidden">
  <div class="toolbar mb-3 flex shrink-0 flex-col gap-3 sm:mb-0 sm:flex-row sm:items-center sm:justify-between">
    <div class="min-w-0 flex-1">
      <p class="truncate text-lg font-semibold sm:text-xl" title={model || ''}>
        {#if loadingModels}
          加载模型中…
        {:else if model}
          {model}
        {:else}
          未选择模型
        {/if}
      </p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Sheet.Root bind:open={paramsSheetOpen}>
        <Sheet.Trigger class="inline-flex lg:hidden">
          <Button variant="outline" size="sm" type="button" class="h-9 min-h-9">参数设置</Button>
        </Sheet.Trigger>
        <Sheet.Content side="right" class="flex w-full max-w-none flex-col gap-0 border-l p-0 sm:max-w-md">
          <Sheet.Header class="border-b px-4 py-3 text-left">
            <Sheet.Title>参数设置</Sheet.Title>
          </Sheet.Header>
          <ScrollArea class="h-[calc(100dvh-4.5rem)]" orientation="vertical">
            <div class="p-4 pb-8">
              <PlaygroundParamsFields
                idPrefix="sheet"
                bind:model
                bind:group
                bind:systemPrompt
                bind:stream
                bind:temperature
                bind:topP
                bind:maxTokens
                bind:frequencyPenalty
                bind:presencePenalty
                bind:seedStr
                bind:parameterEnabled
                {models}
                {groupOptions}
                {loadingModels}
                {loadingGroups}
                loadModels={loadModels}
                loadGroups={loadGroups}
              />
            </div>
          </ScrollArea>
        </Sheet.Content>
      </Sheet.Root>
      <Button variant="outline" size="sm" type="button" class="h-9 min-h-9" onclick={clearMessages}>
        清空对话
      </Button>
    </div>
  </div>

  <div
    class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden [grid-template-rows:minmax(0,1fr)] lg:grid-cols-[minmax(280px,400px)_1fr]"
  >
    <aside class="panel hidden min-h-0 overflow-y-auto p-2 lg:block">
      <PlaygroundParamsFields
        idPrefix="side"
        bind:model
        bind:group
        bind:systemPrompt
        bind:stream
        bind:temperature
        bind:topP
        bind:maxTokens
        bind:frequencyPenalty
        bind:presencePenalty
        bind:seedStr
        bind:parameterEnabled
        {models}
        {groupOptions}
        {loadingModels}
        {loadingGroups}
        loadModels={loadModels}
        loadGroups={loadGroups}
      />
    </aside>

    <section class="panel flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <ScrollArea class="h-0 min-h-0 flex-1" orientation="vertical">
        <div class="w-full space-y-3 px-3 py-3">
          {#if messages.length === 0}
            <div class="text-sm text-muted-foreground">发送第一条消息开始对话。</div>
          {:else}
            {#each messages as msg}
              <div>
                <div class="mb-0.5 text-xs text-muted-foreground">{msg.role === 'user' ? '你' : '助手'}</div>
                <pre class="whitespace-pre-wrap break-words text-sm font-sans">{msg.content}</pre>
              </div>
            {/each}
          {/if}
          {#if errorMsg}
            <p class="text-sm text-destructive">{errorMsg}</p>
          {/if}
        </div>
      </ScrollArea>

      <form
        class="shrink-0 border-t border-gray-200 bg-transparent px-3 py-3 dark:border-border"
        onsubmit={sendMessage}
      >
        <div class="w-full space-y-1.5">
          <Textarea
            bind:value={prompt}
            placeholder="输入消息..."
            class="min-h-14 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
          />
          <div class="flex justify-end">
            <Button type="submit" disabled={sending || !model}>
              {sending ? '发送中...' : '发送'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  </div>
</div>

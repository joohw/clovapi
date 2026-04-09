<svelte:options runes={false} />

<script>
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { apiGet, apiPost, apiPut } from '$lib/api';
  import {
    CHANNEL_TYPE_OPTIONS,
    CHANNEL_STATUS_OPTIONS,
  } from '$lib/admin/channelFormTypes.js';
  import { channelTypeParts } from '$lib/admin/channelLabels.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';

  /** @type {boolean} */
  export let open = false;
  /** @type {number | null} */
  export let channelId = null;
  /** @type {() => void} */
  export let onSuccess = () => {};

  const isEdit = () => channelId != null && Number.isFinite(Number(channelId));

  let loadSeq = 0;
  let loading = false;
  let submitting = false;
  /** @type {Record<string, any> | null} */
  let loaded = null;

  let name = '';
  /** @type {string} */
  let typeStr = '1';
  /** @type {string} */
  let statusStr = '1';
  let key = '';
  let keyNew = '';
  let baseUrl = '';
  let models = '';
  let group = 'default';
  let priorityStr = '';

  /** @type {typeof CHANNEL_TYPE_OPTIONS} */
  let typeOptions = CHANNEL_TYPE_OPTIONS;

  /** 用于在保持打开时切换「添加 / 不同渠道 id」仍能重新加载 */
  let lastFormKey = '';

  /** @param {string} v */
  function typeLabel(v) {
    const t = typeOptions.find((x) => String(x.v) === v);
    return t ? `${t.label} (${t.v})` : v || '—';
  }

  /** @param {string} v */
  function statusLabel(v) {
    const t = CHANNEL_STATUS_OPTIONS.find((x) => String(x.v) === v);
    return t?.label ?? (v ? `状态 ${v}` : '—');
  }

  function resetAddForm() {
    loaded = null;
    name = '';
    typeStr = '1';
    statusStr = '1';
    key = '';
    keyNew = '';
    baseUrl = '';
    models = '';
    group = 'default';
    priorityStr = '';
    typeOptions = CHANNEL_TYPE_OPTIONS;
  }

  function close() {
    open = false;
    resetAddForm();
    loadSeq++;
  }

  $: if (!open) {
    lastFormKey = '';
  }

  $: if (open) {
    const k = String(channelId ?? 'new');
    if (k !== lastFormKey) {
      lastFormKey = k;
      if (channelId != null && Number.isFinite(Number(channelId))) {
        loadChannel(Number(channelId));
      } else {
        resetAddForm();
        loading = false;
      }
    }
  }

  /** @param {number} id */
  async function loadChannel(id) {
    const seq = ++loadSeq;
    loading = true;
    try {
      const res = await apiGet(`/api/channel/${id}`);
      if (seq !== loadSeq) return;
      if (!res?.success || !res.data) {
        showError(res?.message || '加载渠道失败');
        close();
        return;
      }
      loaded = res.data;
      const ch = res.data;
      name = ch.name ?? '';
      typeStr = String(ch.type ?? 1);
      statusStr = String(ch.status ?? 1);
      key = '';
      keyNew = '';
      baseUrl = ch.base_url != null && ch.base_url !== '' ? String(ch.base_url) : '';
      models = (ch.models ?? '')
        .split(',')
        .map((/** @type {string} */ s) => s.trim())
        .filter(Boolean)
        .join('\n');
      group = ch.group ?? 'default';
      priorityStr =
        ch.priority != null && ch.priority !== '' ? String(ch.priority) : '';

      const tv = Number(ch.type);
      const opts = [...CHANNEL_TYPE_OPTIONS];
      if (!opts.some((o) => o.v === tv)) {
        opts.push({ v: tv, label: channelTypeParts(tv).name });
      }
      typeOptions = opts.sort((a, b) => a.v - b.v);
    } catch (_) {
      if (seq === loadSeq) showError('网络错误');
      close();
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  async function submit() {
    if (isEdit()) {
      await submitEdit();
    } else {
      await submitAdd();
    }
  }

  async function submitAdd() {
    if (!name.trim()) {
      showError('请填写渠道名称');
      return;
    }
    if (!key.trim()) {
      showError('请填写 API Key');
      return;
    }
    const modelList = models
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const typeNum = parseInt(typeStr, 10);
    if (!Number.isFinite(typeNum)) {
      showError('请选择类型');
      return;
    }
    /** @type {Record<string, unknown>} */
    const channel = {
      name: name.trim(),
      type: typeNum,
      key: key.trim(),
      models: modelList.join(','),
      group: group.trim() || 'default',
      status: 1,
    };
    const bu = baseUrl.trim();
    if (bu) {
      channel.base_url = bu;
    }
    if (priorityStr.trim() !== '') {
      const p = parseInt(priorityStr.trim(), 10);
      if (Number.isFinite(p)) channel.priority = p;
    }
    submitting = true;
    try {
      const res = await apiPost('/api/channel/', {
        mode: 'single',
        channel,
      });
      if (res?.success) {
        showSuccess('渠道添加成功');
        close();
        onSuccess();
      } else {
        showError(res?.message || '添加失败');
      }
    } catch (_) {
      showError('请求失败');
    } finally {
      submitting = false;
    }
  }

  async function submitEdit() {
    if (!loaded?.id) return;
    if (!name.trim()) {
      showError('请填写渠道名称');
      return;
    }
    const typeNum = parseInt(typeStr, 10);
    const statusNum = parseInt(statusStr, 10);
    if (!Number.isFinite(typeNum) || !Number.isFinite(statusNum)) {
      showError('参数无效');
      return;
    }
    const modelList = models
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',');
    let priority = loaded.priority;
    if (priorityStr.trim() !== '') {
      const p = parseInt(priorityStr.trim(), 10);
      if (Number.isFinite(p)) priority = p;
    }
    const bu = baseUrl.trim();

    /** @type {Record<string, unknown>} */
    const payload = {
      ...loaded,
      id: loaded.id,
      name: name.trim(),
      type: typeNum,
      status: statusNum,
      models: modelList,
      group: group.trim() || 'default',
      priority,
      base_url: bu || null,
    };
    const kn = keyNew.trim();
    if (kn) {
      payload.key = kn;
    }

    submitting = true;
    try {
      const res = await apiPut('/api/channel/', payload);
      if (res?.success) {
        showSuccess('渠道已保存');
        close();
        onSuccess();
      } else {
        showError(res?.message || '保存失败');
      }
    } catch (_) {
      showError('请求失败');
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>{isEdit() ? '编辑渠道' : '添加渠道'}</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        {#if isEdit()}
          修改名称、类型、状态、模型与分组等。新 API Key 留空则不修改。复杂渠道请在完整控制台操作。
        {:else}
          使用单 Key 模式添加。Vertex / Codex 等特殊类型请在完整控制台配置。
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if loading}
      <p class="py-6 text-sm text-muted-foreground">加载中…</p>
    {:else}
      <div class="flex flex-col gap-4 py-2 md:flex-row md:items-stretch md:gap-6">
        <div class="min-w-0 shrink-0 space-y-3 md:w-[min(100%,22rem)] md:max-w-sm">
          <div>
            <label class="auth-label" for="ch-name">名称</label>
            <Input id="ch-name" bind:value={name} placeholder="显示名称" />
          </div>
          <div>
            <label class="auth-label" for="ch-type">类型</label>
            <Select.Root type="single" bind:value={typeStr}>
              <Select.Trigger id="ch-type" class="w-full min-w-0 max-w-full">
                <span class="truncate text-left">{typeLabel(typeStr)}</span>
              </Select.Trigger>
              <Select.Content>
                {#each typeOptions as t}
                  <Select.Item value={String(t.v)} label={t.label}>{t.label} ({t.v})</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          {#if isEdit()}
            <div>
              <label class="auth-label" for="ch-status">状态</label>
              <Select.Root type="single" bind:value={statusStr}>
                <Select.Trigger id="ch-status" class="w-full min-w-0 max-w-full">
                  <span class="truncate text-left">{statusLabel(statusStr)}</span>
                </Select.Trigger>
                <Select.Content>
                  {#each CHANNEL_STATUS_OPTIONS as s}
                    <Select.Item value={String(s.v)} label={s.label}>{s.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
          <div>
            <label class="auth-label" for="ch-key">
              {isEdit() ? '新 API Key（可选）' : 'API Key'}
            </label>
            {#if isEdit()}
              <Input
                id="ch-key"
                bind:value={keyNew}
                placeholder="留空则不修改密钥"
                class="font-mono"
                autocomplete="off"
              />
            {:else}
              <Input id="ch-key" bind:value={key} placeholder="sk-..." class="font-mono" autocomplete="off" />
            {/if}
          </div>
          <div>
            <label class="auth-label" for="ch-base">Base URL（可选）</label>
            <Input
              id="ch-base"
              bind:value={baseUrl}
              placeholder={isEdit() ? 'https://...' : 'https://api.openai.com/v1'}
            />
          </div>
          <div>
            <label class="auth-label" for="ch-group">分组</label>
            <Input id="ch-group" bind:value={group} placeholder="default" />
          </div>
          <div>
            <label class="auth-label" for="ch-priority">优先级（可选）</label>
            <Input
              id="ch-priority"
              bind:value={priorityStr}
              placeholder="数字越大越优先"
              inputmode="numeric"
            />
          </div>
        </div>
        <div class="flex min-h-[min(42vh,420px)] min-w-0 flex-1 flex-col gap-1.5 border-t border-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <label class="auth-label shrink-0" for="ch-models">模型列表（可选）</label>
          <textarea
            id="ch-models"
            class="auth-input min-h-[12rem] w-full flex-1 resize-none font-mono text-xs leading-relaxed md:min-h-0"
            bind:value={models}
            placeholder="多个模型用英文逗号或换行分隔，留空表示不限制"
          ></textarea>
        </div>
      </div>
    {/if}
    <Dialog.Footer class="gap-2">
      <Button variant="outline" type="button" onclick={close} disabled={submitting || loading}
        >取消</Button
      >
      <Button type="button" disabled={submitting || loading} onclick={submit}>
        {submitting ? (isEdit() ? '保存中…' : '提交中…') : isEdit() ? '保存' : '添加'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

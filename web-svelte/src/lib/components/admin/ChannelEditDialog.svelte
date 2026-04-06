<svelte:options runes={false} />

<script>
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { apiGet, apiPut } from '$lib/api';
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
  export let onSaved = () => {};

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
  let keyNew = '';
  let baseUrl = '';
  let models = '';
  let group = 'default';
  let priorityStr = '';

  /** @type {typeof CHANNEL_TYPE_OPTIONS} */
  let typeOptions = CHANNEL_TYPE_OPTIONS;

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

  function reset() {
    loaded = null;
    name = '';
    typeStr = '1';
    statusStr = '1';
    keyNew = '';
    baseUrl = '';
    models = '';
    group = 'default';
    priorityStr = '';
    typeOptions = CHANNEL_TYPE_OPTIONS;
  }

  function close() {
    open = false;
    reset();
  }

  /** 避免 $: 在 loaded 更新后重复触发 load */
  let lastLoadedId = /** @type {number | null} */ (null);

  $: if (!open) {
    lastLoadedId = null;
  }

  $: if (open && channelId != null && channelId !== lastLoadedId) {
    lastLoadedId = channelId;
    loadChannel(channelId);
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
    if (keyNew.trim()) {
      payload.key = keyNew.trim();
    }

    submitting = true;
    try {
      const res = await apiPut('/api/channel/', payload);
      if (res?.success) {
        showSuccess('渠道已保存');
        close();
        onSaved();
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
  <Dialog.Content class="max-h-[90vh] max-w-lg overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>编辑渠道</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        修改名称、类型、状态、模型与分组等。API Key 留空则不修改。复杂渠道请在完整控制台操作。
      </Dialog.Description>
    </Dialog.Header>
    {#if loading}
      <p class="py-6 text-sm text-muted-foreground">加载中…</p>
    {:else}
      <div class="space-y-3 py-2">
        <div>
          <label class="auth-label" for="ch-edit-name">名称</label>
          <Input id="ch-edit-name" bind:value={name} placeholder="显示名称" />
        </div>
        <div>
          <label class="auth-label" for="ch-edit-type">类型</label>
          <Select.Root type="single" bind:value={typeStr}>
            <Select.Trigger id="ch-edit-type" class="w-full min-w-0 max-w-full">
              <span class="truncate text-left">{typeLabel(typeStr)}</span>
            </Select.Trigger>
            <Select.Content>
              {#each typeOptions as t}
                <Select.Item value={String(t.v)} label={t.label}>{t.label} ({t.v})</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label class="auth-label" for="ch-edit-status">状态</label>
          <Select.Root type="single" bind:value={statusStr}>
            <Select.Trigger id="ch-edit-status" class="w-full min-w-0 max-w-full">
              <span class="truncate text-left">{statusLabel(statusStr)}</span>
            </Select.Trigger>
            <Select.Content>
              {#each CHANNEL_STATUS_OPTIONS as s}
                <Select.Item value={String(s.v)} label={s.label}>{s.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label class="auth-label" for="ch-edit-key">新 API Key（可选）</label>
          <Input
            id="ch-edit-key"
            bind:value={keyNew}
            placeholder="留空则不修改密钥"
            class="font-mono"
            autocomplete="off"
          />
        </div>
        <div>
          <label class="auth-label" for="ch-edit-base">Base URL（可选）</label>
          <Input id="ch-edit-base" bind:value={baseUrl} placeholder="https://..." />
        </div>
        <div>
          <label class="auth-label" for="ch-edit-models">模型列表（可选）</label>
          <textarea
            id="ch-edit-models"
            class="auth-input min-h-[60px] w-full resize-y text-xs"
            bind:value={models}
            placeholder="多个模型用英文逗号或换行分隔"
          ></textarea>
        </div>
        <div>
          <label class="auth-label" for="ch-edit-group">分组</label>
          <Input id="ch-edit-group" bind:value={group} placeholder="default" />
        </div>
        <div>
          <label class="auth-label" for="ch-edit-priority">优先级（可选）</label>
          <Input
            id="ch-edit-priority"
            bind:value={priorityStr}
            placeholder="数字越大越优先"
            inputmode="numeric"
          />
        </div>
      </div>
    {/if}
    <Dialog.Footer class="gap-2">
      <Button variant="outline" type="button" onclick={close} disabled={submitting || loading}
        >取消</Button
      >
      <Button type="button" disabled={submitting || loading} onclick={submit}>
        {submitting ? '保存中…' : '保存'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

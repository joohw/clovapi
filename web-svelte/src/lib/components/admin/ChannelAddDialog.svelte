<svelte:options runes={false} />

<script>
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { apiPost } from '$lib/api';
  import { CHANNEL_TYPE_OPTIONS } from '$lib/admin/channelFormTypes.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';

  /** @type {boolean} */
  export let open = false;
  /** @type {() => void} */
  export let onAdded = () => {};

  let name = '';
  /** @type {string} */
  let typeStr = '1';
  let key = '';
  let baseUrl = '';
  let models = '';
  let group = 'default';
  let submitting = false;

  /** @param {string} v */
  function typeLabel(v) {
    const t = CHANNEL_TYPE_OPTIONS.find((x) => String(x.v) === v);
    return t ? `${t.label} (${t.v})` : v || '—';
  }

  function reset() {
    name = '';
    typeStr = '1';
    key = '';
    baseUrl = '';
    models = '';
    group = 'default';
  }

  function close() {
    open = false;
    reset();
  }

  async function submit() {
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
      group: (group.trim() || 'default'),
      status: 1,
    };
    const bu = baseUrl.trim();
    if (bu) {
      channel.base_url = bu;
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
        onAdded();
      } else {
        showError(res?.message || '添加失败');
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
      <Dialog.Title>添加渠道</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        使用单 Key 模式添加。Vertex / Codex 等特殊类型请在完整控制台配置。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 py-2">
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
            {#each CHANNEL_TYPE_OPTIONS as t}
              <Select.Item value={String(t.v)} label={t.label}>{t.label} ({t.v})</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label class="auth-label" for="ch-key">API Key</label>
        <Input id="ch-key" bind:value={key} placeholder="sk-..." class="font-mono" autocomplete="off" />
      </div>
      <div>
        <label class="auth-label" for="ch-base">Base URL（可选）</label>
        <Input id="ch-base" bind:value={baseUrl} placeholder="https://api.openai.com/v1" />
      </div>
      <div>
        <label class="auth-label" for="ch-models">模型列表（可选）</label>
        <textarea
          id="ch-models"
          class="auth-input min-h-[60px] w-full resize-y text-xs"
          bind:value={models}
          placeholder="多个模型用英文逗号或换行分隔，留空表示不限制"
        ></textarea>
      </div>
      <div>
        <label class="auth-label" for="ch-group">分组</label>
        <Input id="ch-group" bind:value={group} placeholder="default" />
      </div>
    </div>
    <Dialog.Footer class="gap-2">
      <Button variant="outline" type="button" onclick={close} disabled={submitting}>取消</Button>
      <Button type="button" disabled={submitting} onclick={submit}>
        {submitting ? '提交中…' : '添加'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

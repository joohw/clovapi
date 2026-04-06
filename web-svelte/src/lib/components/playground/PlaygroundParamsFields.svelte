<script>
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Switch } from '$lib/components/ui/switch';
  import { Separator } from '$lib/components/ui/separator';
  import * as Select from '$lib/components/ui/select';

  let {
    loadingModels = false,
    loadingGroups = false,
    models = [],
    groupOptions = [],
    model = $bindable(''),
    group = $bindable(''),
    systemPrompt = $bindable(''),
    stream = $bindable(true),
    temperature = $bindable(0.7),
    topP = $bindable(1),
    maxTokens = $bindable(4096),
    frequencyPenalty = $bindable(0),
    presencePenalty = $bindable(0),
    seedStr = $bindable(''),
    parameterEnabled = $bindable({
      temperature: true,
      top_p: true,
      max_tokens: false,
      frequency_penalty: true,
      presence_penalty: true,
      seed: false
    }),
    loadModels = async () => {},
    loadGroups = async () => {},
    /** 避免桌面与 Sheet 内两份表单 id 冲突 */
    idPrefix = 'pg',
    class: className = ''
  } = $props();

  /**
   * @param {string} key
   * @param {boolean} v
   */
  function setParamEnabled(key, v) {
    parameterEnabled = { ...parameterEnabled, [key]: v };
  }
</script>

<div class="space-y-3 {className}">
  <div class="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" onclick={() => loadModels()} disabled={loadingModels}>
      {loadingModels ? '刷新中...' : '刷新模型'}
    </Button>
    <Button variant="outline" size="sm" onclick={() => loadGroups()} disabled={loadingGroups}>
      {loadingGroups ? '分组...' : '刷新分组'}
    </Button>
  </div>

  <div class="space-y-2">
    <Label for={`${idPrefix}-model-select`} class="text-muted-foreground">模型</Label>
    <Select.Root type="single" bind:value={model} disabled={loadingModels || models.length === 0}>
      <Select.Trigger id={`${idPrefix}-model-select`} class="w-full min-w-0 max-w-full">
        <span class="truncate text-left">{model || (models.length === 0 ? '暂无模型' : '选择模型')}</span>
      </Select.Trigger>
      <Select.Content>
        {#each models as m}
          <Select.Item value={m} label={m}>{m}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="space-y-2">
    <Label for={`${idPrefix}-group-select`} class="text-muted-foreground">分组</Label>
    <Select.Root type="single" bind:value={group} disabled={loadingGroups}>
      <Select.Trigger id={`${idPrefix}-group-select`} class="w-full min-w-0 max-w-full">
        <span class="truncate text-left"
          >{groupOptions.find((g) => g.value === group)?.label || group || '—'}</span
        >
      </Select.Trigger>
      <Select.Content>
        {#each groupOptions as g}
          <Select.Item value={g.value} label={g.label}>{g.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="space-y-2">
    <Label for={`${idPrefix}-system`}>系统提示</Label>
    <Textarea
      id={`${idPrefix}-system`}
      bind:value={systemPrompt}
      placeholder="可选，会作为 system 消息置于对话开头"
      class="min-h-[72px]"
    />
  </div>

  <div class="flex items-center justify-between gap-3">
    <Label for={`${idPrefix}-stream`} class="cursor-pointer">流式输出</Label>
    <Switch id={`${idPrefix}-stream`} bind:checked={stream} />
  </div>

  <Separator />

  <div class="space-y-3">
    <p class="text-xs text-muted-foreground">采样与长度（勾选才参与请求）</p>

    <div class="flex items-start gap-2">
      <Checkbox
        class="mt-0.5"
        checked={parameterEnabled.temperature}
        onCheckedChange={(v) => setParamEnabled('temperature', v === true)}
      />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for={`${idPrefix}-temp`}>Temperature</Label>
        <Input
          id={`${idPrefix}-temp`}
          type="number"
          min="0"
          max="2"
          step="0.1"
          bind:value={temperature}
          disabled={!parameterEnabled.temperature}
        />
      </div>
    </div>

    <div class="flex items-start gap-2">
      <Checkbox
        class="mt-0.5"
        checked={parameterEnabled.top_p}
        onCheckedChange={(v) => setParamEnabled('top_p', v === true)}
      />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for={`${idPrefix}-topp`}>Top P</Label>
        <Input
          id={`${idPrefix}-topp`}
          type="number"
          min="0"
          max="1"
          step="0.05"
          bind:value={topP}
          disabled={!parameterEnabled.top_p}
        />
      </div>
    </div>

    <div class="flex items-start gap-2">
      <Checkbox
        class="mt-0.5"
        checked={parameterEnabled.max_tokens}
        onCheckedChange={(v) => setParamEnabled('max_tokens', v === true)}
      />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for={`${idPrefix}-max`}>Max tokens</Label>
        <Input
          id={`${idPrefix}-max`}
          type="number"
          min="1"
          max="128000"
          step="1"
          bind:value={maxTokens}
          disabled={!parameterEnabled.max_tokens}
        />
      </div>
    </div>

    <div class="flex items-start gap-2">
      <Checkbox
        class="mt-0.5"
        checked={parameterEnabled.frequency_penalty}
        onCheckedChange={(v) => setParamEnabled('frequency_penalty', v === true)}
      />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for={`${idPrefix}-freq`}>Frequency penalty</Label>
        <Input
          id={`${idPrefix}-freq`}
          type="number"
          min="-2"
          max="2"
          step="0.1"
          bind:value={frequencyPenalty}
          disabled={!parameterEnabled.frequency_penalty}
        />
      </div>
    </div>

    <div class="flex items-start gap-2">
      <Checkbox
        class="mt-0.5"
        checked={parameterEnabled.presence_penalty}
        onCheckedChange={(v) => setParamEnabled('presence_penalty', v === true)}
      />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for={`${idPrefix}-pres`}>Presence penalty</Label>
        <Input
          id={`${idPrefix}-pres`}
          type="number"
          min="-2"
          max="2"
          step="0.1"
          bind:value={presencePenalty}
          disabled={!parameterEnabled.presence_penalty}
        />
      </div>
    </div>

    <div class="flex items-start gap-2">
      <Checkbox
        class="mt-0.5"
        checked={parameterEnabled.seed}
        onCheckedChange={(v) => setParamEnabled('seed', v === true)}
      />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for={`${idPrefix}-seed`}>Seed</Label>
        <Input
          id={`${idPrefix}-seed`}
          type="text"
          inputmode="numeric"
          bind:value={seedStr}
          placeholder="整数，可选"
          disabled={!parameterEnabled.seed}
        />
      </div>
    </div>
  </div>
</div>

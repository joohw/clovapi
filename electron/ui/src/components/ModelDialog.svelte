<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { closeModelDialog, saveModelFromDialog, store } from "../lib/store.svelte";
  import { CUSTOM_API_PROFILE_NAME } from "../lib/constants";
  import Select from "./Select.svelte";

  const apiStyleOptions = [
    { value: "claude", label: "claude (Anthropic)" },
    { value: "openai-chat", label: "openai-chat" },
    { value: "openai-responses", label: "openai-responses (Codex)" },
    { value: "gemini", label: "gemini" },
  ];

  const isCustomApi = $derived(
    store.modelDialogVendorName.trim() === CUSTOM_API_PROFILE_NAME,
  );

  function onOpenChange(open: boolean) {
    if (!open) closeModelDialog();
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    void saveModelFromDialog();
  }
</script>

<Dialog.Root bind:open={store.modelDialogOpen} onOpenChange={onOpenChange}>
  <Dialog.Content showCloseButton={false} class="sm:max-w-lg">
    <form class="flex flex-col gap-4" onsubmit={onSubmit}>
      <Dialog.Header>
        <Dialog.Title>
          {store.modelDialogMode === "edit" ? "编辑模型" : "添加模型"}
        </Dialog.Title>
        <Dialog.Description>
          {#if isCustomApi}
            自定义 API 表示来源类型；请为每条模型填写网关地址、Key、上游 model id 与 API 风格。
          {:else}
            模型绑定 API 风格与上游 model id。
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4">
        {#if isCustomApi}
          <div class="grid gap-2">
            <Label for="model-base-url">API 地址</Label>
            <Input
              id="model-base-url"
              bind:value={store.formModelBaseUrl}
              required
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div class="grid gap-2">
            <Label for="model-api-key">API Key</Label>
            <Input id="model-api-key" bind:value={store.formModelApiKey} required />
          </div>
        {/if}
        <div class="grid gap-2">
          <Label for="model-label">显示名称</Label>
          <Input id="model-label" bind:value={store.formModelLabel} required placeholder="GPT-4o Mini" />
        </div>
        <div class="grid gap-2">
          <Label for="model-id">上游 model id</Label>
          <Input id="model-id" bind:value={store.formModelName} required placeholder="gpt-4o-mini" />
        </div>
        <div class="grid gap-2">
          <Label for="model-api-style">API 风格</Label>
          <Select block bind:value={store.formModelApiStyle} options={apiStyleOptions} />
        </div>
      </div>

      <Dialog.Footer class="border-t border-border pt-4">
        <Button type="button" variant="outline" onclick={() => closeModelDialog()}>取消</Button>
        <Button type="submit">保存</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

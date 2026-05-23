<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { i18n, t } from "../lib/i18n";
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

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      editTitle: t("modelDialog.editTitle"),
      addTitle: t("modelDialog.addTitle"),
      customDesc: t("modelDialog.customDesc"),
      defaultDesc: t("modelDialog.defaultDesc"),
      displayName: t("modelDialog.displayName"),
      upstreamModelId: t("modelDialog.upstreamModelId"),
      apiStyle: t("modelDialog.apiStyle"),
      apiUrl: t("profileDialog.apiUrl"),
      cancel: t("common.cancel"),
      save: t("common.save"),
    };
  });

  const dialogTitle = $derived(
    store.modelDialogMode === "edit" ? copy.editTitle : copy.addTitle,
  );

  const dialogDescription = $derived(isCustomApi ? copy.customDesc : copy.defaultDesc);

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
        <Dialog.Title>{dialogTitle}</Dialog.Title>
        <Dialog.Description>{dialogDescription}</Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4">
        {#if isCustomApi}
          <div class="grid gap-2">
            <Label for="model-base-url">{copy.apiUrl}</Label>
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
          <Label for="model-label">{copy.displayName}</Label>
          <Input id="model-label" bind:value={store.formModelLabel} required placeholder="GPT-4o Mini" />
        </div>
        <div class="grid gap-2">
          <Label for="model-id">{copy.upstreamModelId}</Label>
          <Input id="model-id" bind:value={store.formModelName} required placeholder="gpt-4o-mini" />
        </div>
        <div class="grid gap-2">
          <Label for="model-api-style">{copy.apiStyle}</Label>
          <Select block bind:value={store.formModelApiStyle} options={apiStyleOptions} />
        </div>
      </div>

      <Dialog.Footer class="border-t border-border pt-4">
        <Button type="button" variant="outline" onclick={() => closeModelDialog()}>{copy.cancel}</Button>
        <Button type="submit">{copy.save}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

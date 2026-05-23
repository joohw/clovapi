<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { i18n, t } from "../lib/i18n";
  import { closeProfileDialog, saveProfileFromDialog, store } from "../lib/store.svelte";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("profileDialog.title"),
      description: t("profileDialog.description"),
      apiUrl: t("profileDialog.apiUrl"),
      apiKeyPlaceholder: t("profileDialog.apiKeyPlaceholder"),
      cancel: t("common.cancel"),
      save: t("common.save"),
    };
  });

  function onOpenChange(open: boolean) {
    if (!open) closeProfileDialog();
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    void saveProfileFromDialog();
  }
</script>

<Dialog.Root bind:open={store.profileDialogOpen} onOpenChange={onOpenChange}>
  <Dialog.Content showCloseButton={false} class="sm:max-w-lg">
    <form class="flex flex-col gap-4" onsubmit={onSubmit}>
      <Dialog.Header>
        <Dialog.Title>{copy.title}</Dialog.Title>
        <Dialog.Description>{copy.description}</Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4">
        <div class="grid gap-2">
          <Label for="profile-base-url">{copy.apiUrl}</Label>
          <Input
            id="profile-base-url"
            bind:value={store.formBaseUrl}
            required
            placeholder="http://127.0.0.1:11434/v1"
          />
        </div>
        <div class="grid gap-2">
          <Label for="profile-api-key">API Key</Label>
          <Input
            id="profile-api-key"
            bind:value={store.formApiKey}
            placeholder={copy.apiKeyPlaceholder}
          />
        </div>
      </div>

      <Dialog.Footer class="border-t border-border pt-4">
        <Button type="button" variant="outline" onclick={() => closeProfileDialog()}>
          {copy.cancel}
        </Button>
        <Button type="submit">{copy.save}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

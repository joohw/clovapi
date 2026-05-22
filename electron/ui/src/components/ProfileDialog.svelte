<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { closeProfileDialog, saveProfileFromDialog, store } from "../lib/store.svelte";
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
        <Dialog.Title>编辑 Ollama</Dialog.Title>
        <Dialog.Description>
          修改 Ollama 连接地址与 Key；模型通过拉取或手动添加。
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4">
        <div class="grid gap-2">
          <Label for="profile-base-url">API 地址</Label>
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
            placeholder="ollama（可留空）"
          />
        </div>
      </div>

      <Dialog.Footer class="border-t border-border pt-4">
        <Button type="button" variant="outline" onclick={() => closeProfileDialog()}>
          取消
        </Button>
        <Button type="submit">保存</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

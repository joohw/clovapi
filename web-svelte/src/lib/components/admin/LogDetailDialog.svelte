<svelte:options runes={false} />

<script>
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { apiGet } from '$lib/api';
  import { copy } from '$lib/dashboard/helpers.js';
  import { showError, showSuccess } from '$lib/dashboard/notify.js';

  /** @type {boolean} */
  export let open = false;
  /** @type {string} */
  export let requestId = '';

  let loading = false;
  let errorMsg = '';
  /** @type {string} */
  let bodyPretty = '';
  /** @type {any} */
  let meta = null;
  let loadSeq = 0;

  $: if (open && requestId) {
    loadDetail(requestId);
  }
  $: if (!open) {
    errorMsg = '';
    bodyPretty = '';
    meta = null;
  }

  /**
   * @param {string} rid
   */
  async function loadDetail(rid) {
    const seq = ++loadSeq;
    loading = true;
    errorMsg = '';
    bodyPretty = '';
    meta = null;
    const q = encodeURIComponent(rid);
    try {
      const bodyRes = await apiGet(`/api/log/conversation/body?request_id=${q}`);
      if (seq !== loadSeq) return;
      if (!bodyRes?.success) {
        errorMsg = bodyRes?.message || '加载失败';
        return;
      }
      const raw = bodyRes.data?.body;
      if (raw && String(raw).trim() !== '') {
        try {
          const j = JSON.parse(String(raw));
          bodyPretty = JSON.stringify(j, null, 2);
        } catch (_) {
          bodyPretty = String(raw);
        }
        return;
      }
      const convRes = await apiGet(`/api/log/conversation?request_id=${q}`);
      if (seq !== loadSeq) return;
      if (!convRes?.success) {
        errorMsg = convRes?.message || '加载失败';
        return;
      }
      if (convRes.data) {
        meta = convRes.data;
        bodyPretty = JSON.stringify(convRes.data, null, 2);
      } else {
        errorMsg = '暂无对话记录（未开启记录或 request_id 无效）';
      }
    } catch (_) {
      if (seq === loadSeq) errorMsg = '网络错误';
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  async function copyBody() {
    if (!bodyPretty) return;
    const ok = await copy(bodyPretty);
    if (ok) showSuccess('已复制');
    else showError('复制失败');
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-4 sm:max-w-[min(1200px,calc(100%-2rem))]"
  >
    <Dialog.Header>
      <Dialog.Title>日志详情</Dialog.Title>
      <Dialog.Description class="font-mono text-xs text-muted-foreground break-all">
        request_id: {requestId || '—'}
      </Dialog.Description>
    </Dialog.Header>
    <div class="min-h-0 flex-1 overflow-hidden">
      {#if loading}
        <p class="text-sm text-muted-foreground">加载中…</p>
      {:else if errorMsg}
        <p class="text-sm text-destructive">{errorMsg}</p>
      {:else if bodyPretty}
        <div class="mb-2 flex justify-end">
          <Button variant="outline" size="sm" type="button" onclick={copyBody}>复制 JSON</Button>
        </div>
        <ScrollArea
          class="h-[min(65vh,620px)] w-full rounded-none border border-border bg-muted/30"
          orientation="vertical"
        >
          <pre
            class="min-w-0 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground"
          >{bodyPretty}</pre>
        </ScrollArea>
      {:else}
        <p class="text-sm text-muted-foreground">无内容</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" type="button" onclick={() => (open = false)}>关闭</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

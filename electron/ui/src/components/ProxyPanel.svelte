<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { restartLocalProxy, store } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const pathHint = "/{providerId}/{modelId}/{apiStyle}/v1";

  const statusLine = $derived(
    store.proxyRunning
      ? `运行中 · ${store.proxyBaseUrl} · 应用后 CLI 走 ${pathHint}/…`
      : "未运行 · 应用 CLI 时将自动启动，也可手动重启服务",
  );

  const proxyDescription =
    `CLI 将 base URL 指向 ${pathHint}；代理按路径转发，无需在 active 中绑定上游。代理始终启用。`;
</script>

<SectionCard title="本地代理" description={proxyDescription}>
  <ListRow title="代理服务" lines={[statusLine]}>
    {#snippet actions()}
      <Button size="sm" disabled={store.running} onclick={() => void restartLocalProxy()}>
        重启服务
      </Button>
    {/snippet}
  </ListRow>
</SectionCard>

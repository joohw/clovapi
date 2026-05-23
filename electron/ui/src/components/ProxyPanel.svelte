<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ModelTestStatus } from "../global";
  import { restartLocalProxy, runProxyHealthTest, store } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const pathHint = "/{providerId}/{modelId}/{apiStyle}/v1";

  const statusLine = $derived(
    store.proxyRunning
      ? `运行中 · ${store.proxyBaseUrl}`
      : "未运行 · 应用 CLI 时将自动启动，也可手动重启服务",
  );

  const proxyDescription =
    `CLI 将 base URL 指向 ${pathHint}；代理按路径转发，无需在 active 中绑定上游。代理始终启用。`;

  const proxyHealthTest = $derived(store.proxyHealthTest);
  const proxyHealthTesting = $derived(proxyHealthTest?.status === "testing");

  function proxyHealthTestStatus(value: string | undefined): "" | ModelTestStatus {
    if (value === "testing" || value === "pass" || value === "fail") return value;
    return "";
  }
</script>

<SectionCard title="本地代理" description={proxyDescription}>
  <ListRow
    title="代理服务"
    lines={[statusLine]}
    showStatusDot={Boolean(proxyHealthTest?.status)}
    testStatus={proxyHealthTestStatus(proxyHealthTest?.status)}
    testSummary={proxyHealthTest?.summary || ""}
  >
    {#snippet actions()}
      <Button
        size="sm"
        variant="outline"
        disabled={store.running || proxyHealthTesting}
        onclick={() => void runProxyHealthTest()}
      >
        {proxyHealthTesting ? "测试中…" : "测试"}
      </Button>
      <Button size="sm" disabled={store.running || proxyHealthTesting} onclick={() => void restartLocalProxy()}>
        重启服务
      </Button>
    {/snippet}
  </ListRow>
</SectionCard>

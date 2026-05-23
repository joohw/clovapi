<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ModelTestStatus } from "../global";
  import { i18n, t } from "../lib/i18n";
  import { restartLocalProxy, runProxyHealthTest, store } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const pathHint = "/{providerId}/{modelId}/{apiStyle}/v1";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("proxy.title"),
      description: t("proxy.description", { path: pathHint }),
      service: t("proxy.service"),
      statusLine: store.proxyRunning
        ? t("proxy.running", { url: store.proxyBaseUrl })
        : t("proxy.stopped"),
      test: t("common.test"),
      testing: t("common.testing"),
      restart: t("proxy.restart"),
    };
  });

  const proxyHealthTest = $derived(store.proxyHealthTest);
  const proxyHealthTesting = $derived(proxyHealthTest?.status === "testing");

  function proxyHealthTestStatus(value: string | undefined): "" | ModelTestStatus {
    if (value === "testing" || value === "pass" || value === "fail") return value;
    return "";
  }
</script>

<SectionCard title={copy.title} description={copy.description}>
  <ListRow
    title={copy.service}
    lines={[copy.statusLine]}
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
        {proxyHealthTesting ? copy.testing : copy.test}
      </Button>
      <Button size="sm" disabled={store.running || proxyHealthTesting} onclick={() => void restartLocalProxy()}>
        {copy.restart}
      </Button>
    {/snippet}
  </ListRow>
</SectionCard>

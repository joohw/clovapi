<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ModelTestStatus } from "../global";
  import { isElectronDev } from "../lib/constants";
  import { i18n, t } from "../lib/i18n";
  import {
    checkCoreUpdate,
    installCoreUpdate,
    restartLocalProxy,
    runProxyHealthTest,
    store,
  } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const pathHint = "/{providerId}/{modelId}/{apiStyle}/v1";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("proxy.title"),
      description: store.coreVersion
        ? t("proxy.currentVersionLine", { version: store.coreVersion })
        : t("proxy.currentVersionUnknown"),
      service: t("proxy.service"),
      statusLine: store.proxyRunning
        ? t("proxy.running", { url: store.proxyBaseUrl })
        : t("proxy.stopped"),
      version: t("proxy.version"),
      versionLine: store.coreVersion
        ? t("proxy.versionLine", { version: store.coreVersion })
        : t("proxy.versionUnknown"),
      test: t("common.test"),
      testing: t("common.testing"),
      restart: t("proxy.restart"),
      checkUpdate: t("proxy.checkUpdate"),
      installUpdate: t("proxy.installUpdate"),
      updating: t("proxy.updating"),
      updateDisabledInDev: t("proxy.updateDisabledInDev"),
    };
  });

  const electronDev = isElectronDev();

  const proxyHealthTest = $derived(store.proxyHealthTest);
  const proxyHealthTesting = $derived(proxyHealthTest?.status === "testing");
  const coreUpdateCheck = $derived(store.coreUpdateCheck);
  const coreUpdateTesting = $derived(coreUpdateCheck?.status === "testing" || store.coreUpdating);
  const coreUpdateBusy = $derived(store.running || coreUpdateTesting);

  function rowTestStatus(value: string | undefined): "" | ModelTestStatus {
    if (value === "testing" || value === "pass" || value === "fail") return value;
    return "";
  }
</script>

<SectionCard title={copy.title} description={copy.description}>
  <ListRow
    title={copy.service}
    lines={[copy.statusLine]}
    showStatusDot={Boolean(proxyHealthTest?.status)}
    testStatus={rowTestStatus(proxyHealthTest?.status)}
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

  <ListRow
    title={copy.version}
    lines={electronDev ? [copy.versionLine, copy.updateDisabledInDev] : [copy.versionLine]}
    testStatus={electronDev ? "" : rowTestStatus(coreUpdateCheck?.status)}
    testSummary={electronDev ? "" : coreUpdateCheck?.summary || ""}
  >
    {#snippet actions()}
      {#if !electronDev}
        <Button
          size="sm"
          variant="outline"
          disabled={coreUpdateBusy}
          onclick={() => void checkCoreUpdate()}
        >
          {coreUpdateTesting && !store.coreUpdating ? copy.testing : copy.checkUpdate}
        </Button>
        {#if store.coreUpdateAvailable}
          <Button size="sm" disabled={coreUpdateBusy} onclick={() => void installCoreUpdate()}>
            {store.coreUpdating ? copy.updating : copy.installUpdate}
          </Button>
        {/if}
      {/if}
    {/snippet}
  </ListRow>
</SectionCard>

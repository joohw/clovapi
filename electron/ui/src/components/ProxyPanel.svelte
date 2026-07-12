<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ModelTestStatus } from "../global";
  import { isElectronDev } from "../lib/constants";
  import { i18n, t } from "../lib/i18n";
  import {
    checkAppUpdate,
    checkCoreUpdate,
    installAppUpdate,
    installCoreUpdate,
    restartLocalProxy,
    store,
  } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";

  const electronDev = isElectronDev();

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      appVersion: t("proxy.appVersion"),
      appVersionLine: store.appVersion
        ? t("proxy.appVersionLine", { version: store.appVersion })
        : t("proxy.appVersionUnknown"),
      coreVersion: t("proxy.coreVersion"),
      coreTitle: store.coreVersion
        ? t("proxy.coreTitle", { version: store.coreVersion })
        : t("proxy.coreVersion"),
      testing: t("common.testing"),
      restart: t("proxy.restart"),
      checkUpdate: t("proxy.checkUpdate"),
      installUpdate: t("proxy.installUpdate"),
      appInstallUpdate: t("proxy.appInstallUpdate"),
      updating: t("proxy.updating"),
      updateDisabledInDev: t("proxy.updateDisabledInDev"),
    };
  });

  const coreLines = $derived.by(() => {
    void i18n.locale;
    const lines: string[] = [];
    if (!store.coreVersion) {
      lines.push(t("proxy.coreVersionUnknown"));
    }
    if (electronDev) {
      lines.push(t("proxy.updateDisabledInDev"));
    }
    return lines;
  });

  const appUpdateCheck = $derived(store.appUpdateCheck);
  const appUpdateTesting = $derived(appUpdateCheck?.status === "testing" || store.appUpdating);
  const appUpdateBusy = $derived(store.running || appUpdateTesting);
  const coreUpdateCheck = $derived(store.coreUpdateCheck);
  const coreUpdateTesting = $derived(coreUpdateCheck?.status === "testing" || store.coreUpdating);
  const coreUpdateBusy = $derived(store.running || coreUpdateTesting);
  const coreActionBusy = $derived(store.running);

  function rowTestStatus(value: string | undefined): "" | ModelTestStatus {
    if (value === "testing" || value === "pass" || value === "fail") return value;
    return "";
  }
</script>

<ListRow
  title={copy.appVersion}
  lines={electronDev ? [copy.appVersionLine, copy.updateDisabledInDev] : [copy.appVersionLine]}
  testStatus={electronDev ? "" : rowTestStatus(appUpdateCheck?.status)}
  testSummary={electronDev ? "" : appUpdateCheck?.summary || ""}
>
  {#snippet actions()}
    {#if !electronDev}
      <Button
        size="sm"
        variant="outline"
        disabled={appUpdateBusy}
        onclick={() => void checkAppUpdate()}
      >
        {appUpdateTesting && !store.appUpdating ? copy.testing : copy.checkUpdate}
      </Button>
      {#if store.appUpdateAvailable}
        <Button size="sm" disabled={appUpdateBusy} onclick={() => void installAppUpdate()}>
          {store.appUpdating ? copy.updating : copy.appInstallUpdate}
        </Button>
      {/if}
    {/if}
  {/snippet}
</ListRow>

<ListRow
  title={copy.coreTitle}
  lines={coreLines}
>
  {#snippet actions()}
    <Button size="sm" disabled={coreActionBusy} onclick={() => void restartLocalProxy()}>
      {copy.restart}
    </Button>
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

<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { sortedClisForDisplay } from "../lib/helpers";
  import { i18n, t } from "../lib/i18n";
  import {
    activeBindingForCli,
    buildCliBindingOptions,
    canApplyCliBinding,
    cliApplyTitle,
    onCliBindingChange,
    runCliApply,
    runCliInstall,
    runCliUninstall,
    store,
  } from "../lib/store.svelte";
  import type { CliDef } from "../global";
  import AgentBindingMenu from "./AgentBindingMenu.svelte";
  import CliIcon from "./CliIcon.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  const clis = $derived(sortedClisForDisplay(store.clis, store.cliDetectedPath));

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("cli.title"),
      description: t("cli.description"),
      apply: t("common.apply"),
      install: t("cli.install"),
      uninstall: t("cli.uninstall"),
    };
  });

  function bindingOptions(cli: CliDef) {
    return buildCliBindingOptions(cli, store.profiles, store.subscriptions);
  }

  function rowLines(cli: CliDef, installed: boolean): string[] {
    void i18n.locale;
    return installed
      ? [t("cli.installedAt", { path: store.cliDetectedPath[cli.id] })]
      : [t("cli.notInstalled")];
  }

  function confirmInstall(cli: CliDef) {
    const plan = store.cliInstallPlan[cli.id] || `将安装 ${cli.name}。如果缺少 npm，ClovAPI 会尝试先安装 Node.js LTS/npm。`;
    if (!window.confirm(`${plan}`)) return;
    void runCliInstall(cli);
  }

  function confirmUninstall(cli: CliDef) {
    if (!window.confirm(t("cli.uninstallConfirm", { name: cli.name }))) return;
    void runCliUninstall(cli);
  }
</script>

<SectionCard title={copy.title} description={copy.description}>
  {#each clis as cli (cli.id)}
    {@const installed = Boolean(store.cliDetectedPath[cli.id])}
    {@const activeBinding = activeBindingForCli(cli.kind)}
    <ListRow title={cli.name} lines={rowLines(cli, installed)} linesNowrap muted={!installed} class="py-4">
      {#snippet leading()}
        <CliIcon kind={cli.kind} />
      {/snippet}
      {#snippet actions()}
        {#key `${cli.id}:${activeBinding}:${i18n.locale}`}
          <AgentBindingMenu
            options={bindingOptions(cli)}
            value={activeBinding}
            disabled={!installed || store.running}
            onchange={(v) => void onCliBindingChange(cli, v)}
          />
        {/key}
        {#if !installed && store.cliInstallSupported[cli.id]}
          <Button
            size="lg"
            variant="outline"
            disabled={store.running || store.cliLifecycleBusy[cli.id]}
            onclick={() => confirmInstall(cli)}
          >
            {copy.install}
          </Button>
        {/if}
        {#if installed && store.cliUninstallSupported[cli.id]}
          <Button
            size="lg"
            variant="outline"
            disabled={store.running || store.cliLifecycleBusy[cli.id]}
            onclick={() => confirmUninstall(cli)}
          >
            {copy.uninstall}
          </Button>
        {/if}
        <Button
          size="lg"
          disabled={
            !installed ||
            store.running ||
            !canApplyCliBinding(
              activeBinding,
              store.clovapiAvailable,
              store.subscriptions,
              store.profiles,
            )
          }
          title={cliApplyTitle(cli)}
          onclick={() => void runCliApply(cli)}
        >
          {copy.apply}
        </Button>
      {/snippet}
    </ListRow>
  {/each}
</SectionCard>

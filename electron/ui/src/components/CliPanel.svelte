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

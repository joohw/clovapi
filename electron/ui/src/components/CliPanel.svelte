<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { Button } from "$lib/components/ui/button/index.js";
  import { hasAvailableCliBindingOptions, sortedClisForDisplay } from "../lib/helpers";
  import { CUSTOM_API_PROFILE_NAME } from "../lib/constants";
  import { i18n, t } from "../lib/i18n";
  import {
    activeBindingForCli,
    buildCliBindingOptions,
    canApplyCliBinding,
    cliApplyTitle,
    onCliBindingChange,
    runCliApply,
    runCliReset,
    runCliInstall,
    runCliUninstall,
    openProfilesVendor,
    setActiveTab,
    store,
  } from "../lib/store.svelte";
  import type { CliDef } from "../global";
  import AgentBindingMenu from "./AgentBindingMenu.svelte";
  import CliIcon from "./CliIcon.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

  let selectedCliId = $state("");

  const clis = $derived(sortedClisForDisplay(store.clis, store.cliDetectedPath));
  const selectedCli = $derived(clis.find((cli) => cli.id === selectedCliId));
  const inCliDetail = $derived(Boolean(selectedCliId));
  const hasAvailableApi = $derived(
    hasAvailableCliBindingOptions(store.clis, store.profiles, store.subscriptions),
  );

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("cli.title"),
      description: t("cli.description"),
      back: t("common.back"),
      apply: t("common.apply"),
      install: t("cli.install"),
      uninstall: t("cli.uninstall"),
      resetSettings: t("cli.resetSettings"),
      installing: t("cli.installing"),
      uninstalling: t("cli.uninstalling"),
      command: t("cli.command"),
      api: t("cli.api"),
      installPlan: t("cli.installPlan"),
      noApiTitle: t("cli.noApiTitle"),
      noApiDescription: t("cli.noApiDescription"),
      addApi: t("cli.addApi"),
    };
  });

  function bindingOptions(cli: CliDef) {
    return buildCliBindingOptions(cli, store.profiles, store.subscriptions);
  }

  function installedPath(cli: CliDef): string {
    return String(store.cliDetectedPath[cli.id] || "").trim();
  }

  function isInstalled(cli: CliDef): boolean {
    return Boolean(installedPath(cli));
  }

  function lifecycleAction(cli: CliDef): "install" | "uninstall" | "" {
    return store.cliLifecycleAction[cli.id] || "";
  }

  function lifecycleLabel(cli: CliDef): string {
    const action = lifecycleAction(cli);
    if (action === "install") return copy.installing;
    if (action === "uninstall") return copy.uninstalling;
    return "";
  }

  function rowLines(cli: CliDef, installed: boolean): string[] {
    void i18n.locale;
    const status = lifecycleLabel(cli);
    if (status) return [status];
    return installed ? [t("cli.installedAt", { path: installedPath(cli) })] : [t("cli.notInstalled")];
  }

  function detailDescription(cli: CliDef): string {
    const path = installedPath(cli);
    if (path) return path;
    void i18n.locale;
    return t("cli.notInstalled");
  }

  function confirmInstall(cli: CliDef) {
    const plan =
      store.cliInstallPlan[cli.id] ||
      `Install ${cli.name}. If npm is missing, ClovAPI will try to install Node.js LTS/npm first.`;
    if (!window.confirm(plan)) return;
    void runCliInstall(cli);
  }

  function confirmUninstall(cli: CliDef) {
    if (!window.confirm(t("cli.uninstallConfirm", { name: cli.name }))) return;
    void runCliUninstall(cli);
  }

  function closeDetails() {
    selectedCliId = "";
  }

  function goToApiAdd() {
    setActiveTab("profiles");
    openProfilesVendor(CUSTOM_API_PROFILE_NAME);
  }
</script>

{#if inCliDetail && selectedCli}
  {@const cli = selectedCli}
  {@const installed = isInstalled(cli)}
  {@const activeBinding = activeBindingForCli(cli.kind)}
  {@const lifecycle = lifecycleAction(cli)}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={closeDetails}>
      <ArrowLeftIcon class="size-4" />
      {copy.back}
    </Button>

    <SectionCard title={cli.name} description={detailDescription(cli)}>
      {#snippet leading()}
        <CliIcon kind={cli.kind} />
      {/snippet}
      {#snippet actions()}
        {#if !installed && store.cliInstallSupported[cli.id]}
          <Button
            size="sm"
            variant="outline"
            class={lifecycle === "install" ? "disabled:opacity-100" : ""}
            disabled={store.running || store.cliLifecycleBusy[cli.id]}
            onclick={() => confirmInstall(cli)}
          >
            {#if lifecycle === "install"}
              <LoaderCircleIcon class="size-4 animate-spin" />
            {/if}
            {lifecycle === "install" ? copy.installing : copy.install}
          </Button>
        {/if}
        {#if installed && store.cliUninstallSupported[cli.id]}
          <Button
            size="sm"
            variant="outline"
            class={lifecycle === "uninstall" ? "disabled:opacity-100" : ""}
            disabled={store.running || store.cliLifecycleBusy[cli.id]}
            onclick={() => confirmUninstall(cli)}
          >
            {#if lifecycle === "uninstall"}
              <LoaderCircleIcon class="size-4 animate-spin" />
            {/if}
            {lifecycle === "uninstall" ? copy.uninstalling : copy.uninstall}
          </Button>
        {/if}
        {#if installed}
          <Button
            size="sm"
            variant="outline"
            disabled={store.running || store.cliLifecycleBusy[cli.id]}
            onclick={() => void runCliReset(cli)}
          >
            {copy.resetSettings}
          </Button>
        {/if}
      {/snippet}

      <div class="divide-y divide-border">
        <div class="grid gap-2 px-4 py-4 sm:grid-cols-[9rem_1fr] sm:items-center">
          <div class="text-xs font-medium text-muted-foreground">{copy.command}</div>
          <div class="min-w-0 text-sm font-mono">{cli.command}</div>
        </div>

        {#if !installed && store.cliInstallPlan[cli.id]}
          <div class="grid gap-2 px-4 py-4 sm:grid-cols-[9rem_1fr]">
            <div class="text-xs font-medium text-muted-foreground">{copy.installPlan}</div>
            <p class="text-sm leading-relaxed text-muted-foreground">{store.cliInstallPlan[cli.id]}</p>
          </div>
        {/if}

        <div class="grid gap-3 px-4 py-4 sm:grid-cols-[9rem_1fr] sm:items-center">
          <div class="text-xs font-medium text-muted-foreground">{copy.api}</div>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
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
          </div>
        </div>
      </div>
    </SectionCard>
  </div>
{:else}
  <SectionCard title={copy.title} description={copy.description}>
    {#if !hasAvailableApi}
      <div class="border-b border-border bg-amber-500/5 px-4 py-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="text-sm font-medium">{copy.noApiTitle}</div>
            <p class="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.noApiDescription}</p>
          </div>
          <Button size="lg" variant="outline" class="shrink-0" onclick={goToApiAdd}>
            <PlusIcon class="size-4" />
            {copy.addApi}
          </Button>
        </div>
      </div>
    {/if}

    {#each clis as cli (cli.id)}
      {@const installed = isInstalled(cli)}
      {@const lifecycle = lifecycleAction(cli)}
      <ListRow
        title={cli.name}
        lines={rowLines(cli, installed)}
        testStatus={lifecycle ? "testing" : ""}
        linesNowrap
        centerContent
        muted={!installed}
        class="py-4"
        onOpen={() => (selectedCliId = cli.id)}
        stopActionsPropagation={false}
      >
        {#snippet leading()}
          <CliIcon kind={cli.kind} />
        {/snippet}
        {#snippet actions()}
          {#if lifecycle}
            <LoaderCircleIcon class="size-4 animate-spin text-amber-600" aria-hidden="true" />
          {/if}
          <ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        {/snippet}
      </ListRow>
    {/each}
  </SectionCard>
{/if}

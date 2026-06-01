<script lang="ts">
  import { onMount } from "svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import CliPanel from "./components/CliPanel.svelte";
  import ProfilesPanel from "./components/ProfilesPanel.svelte";
  import ProxyCallLogsPanel from "./components/ProxyCallLogsPanel.svelte";
  import ProxySessionsPanel from "./components/ProxySessionsPanel.svelte";
  import ProxySystemLogsPanel from "./components/ProxySystemLogsPanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import ProfileDialog from "./components/ProfileDialog.svelte";
  import ModelDialog from "./components/ModelDialog.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import { i18n, t } from "./lib/i18n";
  import { initApp, installAppUpdate, setActiveTab, store, type TabId } from "./lib/store.svelte";
  import { isElectronRenderer } from "./lib/constants";

  const inElectron = isElectronRenderer();
  const showAppUpdateBadge = $derived(inElectron && store.appUpdateAvailable);
  const appUpdateProgress = $derived(Math.min(100, Math.max(0, Math.round(store.appUpdateProgress || 0))));

  onMount(() => {
    void initApp();
  });

  function onTabChange(value: string) {
    if (
      value === "cli" ||
      value === "profiles" ||
      value === "call-logs" ||
      value === "sessions" ||
      value === "system-logs" ||
      value === "settings"
    ) {
      setActiveTab(value as TabId);
    }
  }

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("app.title"),
      subtitle: t("app.subtitle"),
      tabs: {
        cli: t("tabs.cli"),
        profiles: t("tabs.profiles"),
        callLogs: t("tabs.callLogs"),
        sessions: t("tabs.sessions"),
        systemLogs: t("tabs.systemLogs"),
        settings: t("tabs.settings"),
      },
      browserBanner: t("toast.profilesBridgeBrowser"),
      updateBadge: t("app.updateBadge", {
        latest: store.appLatestVersion || store.appVersion || "?",
      }),
    };
  });
  const appUpdateButtonTitle = $derived(
    store.appUpdating ? `${copy.updateBadge} · ${appUpdateProgress}%` : copy.updateBadge,
  );
</script>

{#if !inElectron}
  <div class="border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
    {copy.browserBanner}
  </div>
{/if}

{#if inElectron}
  <div class="electron-titlebar-drag-region" aria-hidden="true"></div>
{/if}

<main
  class="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-5 py-5 {inElectron ? 'electron-window-chrome' : ''}"
>
  <header class="mb-5 shrink-0 select-none {inElectron ? 'pt-8' : ''}">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 flex-1 {inElectron ? 'electron-titlebar-drag' : ''}">
        <h1 class="text-lg font-semibold tracking-tight">{copy.title}</h1>
        <p class="mt-1 text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>
      {#if showAppUpdateBadge}
        <div class="electron-no-drag shrink-0">
          <Button
            variant="default"
            size="icon-sm"
            class="rounded-full"
            aria-label={appUpdateButtonTitle}
            title={appUpdateButtonTitle}
            disabled={store.appUpdating}
            onclick={() => void installAppUpdate()}
          >
            {#if store.appUpdating}
              <span class="grid size-5 place-items-center" aria-hidden="true">
                <svg class="size-5 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="4"
                    opacity="0.25"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                    pathLength="100"
                    stroke-dasharray={`${appUpdateProgress} 100`}
                  />
                </svg>
              </span>
            {:else}
              <ArrowUpIcon />
            {/if}
          </Button>
        </div>
      {/if}
    </div>
  </header>

  <Tabs.Root value={store.activeTab} onValueChange={onTabChange} class="flex min-h-0 flex-1 flex-col gap-4">
    <Tabs.List>
      <Tabs.Trigger value="cli">{copy.tabs.cli}</Tabs.Trigger>
      <Tabs.Trigger value="profiles">{copy.tabs.profiles}</Tabs.Trigger>
      <Tabs.Trigger value="call-logs">{copy.tabs.callLogs}</Tabs.Trigger>
      <Tabs.Trigger value="sessions">{copy.tabs.sessions}</Tabs.Trigger>
      <Tabs.Trigger value="system-logs">{copy.tabs.systemLogs}</Tabs.Trigger>
      <Tabs.Trigger value="settings">{copy.tabs.settings}</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="cli" class="min-h-0 outline-none">
      <CliPanel />
    </Tabs.Content>
    <Tabs.Content value="profiles" class="min-h-0 outline-none">
      <ProfilesPanel />
    </Tabs.Content>
    <Tabs.Content value="call-logs" class="min-h-0 outline-none">
      <ProxyCallLogsPanel />
    </Tabs.Content>
    <Tabs.Content value="sessions" class="min-h-0 outline-none">
      <ProxySessionsPanel />
    </Tabs.Content>
    <Tabs.Content value="system-logs" class="min-h-0 outline-none">
      <ProxySystemLogsPanel />
    </Tabs.Content>
    <Tabs.Content value="settings" class="min-h-0 outline-none">
      <SettingsPanel />
    </Tabs.Content>
  </Tabs.Root>
</main>

<ProfileDialog />
<ModelDialog />
<Toaster />

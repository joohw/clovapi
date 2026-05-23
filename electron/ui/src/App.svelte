<script lang="ts">
  import { onMount } from "svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import CliPanel from "./components/CliPanel.svelte";
  import ProfilesPanel from "./components/ProfilesPanel.svelte";
  import ProxyCallLogsPanel from "./components/ProxyCallLogsPanel.svelte";
  import ProxySystemLogsPanel from "./components/ProxySystemLogsPanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import ProfileDialog from "./components/ProfileDialog.svelte";
  import ModelDialog from "./components/ModelDialog.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { i18n, t } from "./lib/i18n";
  import { initApp, setActiveTab, store, type TabId } from "./lib/store.svelte";

  onMount(() => {
    void initApp();
  });

  function onTabChange(value: string) {
    if (
      value === "cli" ||
      value === "profiles" ||
      value === "call-logs" ||
      value === "system-logs" ||
      value === "settings"
    ) {
      setActiveTab(value as TabId);
    }
  }

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      subtitle: t("app.subtitle"),
      tabs: {
        cli: t("tabs.cli"),
        profiles: t("tabs.profiles"),
        callLogs: t("tabs.callLogs"),
        systemLogs: t("tabs.systemLogs"),
        settings: t("tabs.settings"),
      },
    };
  });
</script>

<main class="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-5 py-5">
  <header class="mb-5 shrink-0">
    <h1 class="text-lg font-semibold tracking-tight">ClovAPI Switcher</h1>
    <p class="mt-1 text-xs text-muted-foreground">{copy.subtitle}</p>
  </header>

  <Tabs.Root value={store.activeTab} onValueChange={onTabChange} class="flex min-h-0 flex-1 flex-col gap-4">
    <Tabs.List>
      <Tabs.Trigger value="cli">{copy.tabs.cli}</Tabs.Trigger>
      <Tabs.Trigger value="profiles">{copy.tabs.profiles}</Tabs.Trigger>
      <Tabs.Trigger value="call-logs">{copy.tabs.callLogs}</Tabs.Trigger>
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

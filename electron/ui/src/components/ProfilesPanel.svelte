<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    buildProxyIngressBaseURL,
    canManuallyManageVendorModels,
    isOllamaVendor,
    managedVendorList,
    providerIdForVendor,
    subscriptionIsUsable,
    subscriptionStatusForVendor,
    vendorSummaryLine,
  } from "../lib/helpers";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import {
    canFetchVendorModels,
    addSubscriptionAccount,
    cancelSubscriptionLogin,
    fetchVendorModels,
    isSubscriptionLogging,
    openModelDialog,
    openProfileDialog,
    refreshSubscriptionAccountModels,
    store,
    vendorUsageSummaryForVendor,
  } from "../lib/store.svelte";
  import { OLLAMA_PROFILE_NAME } from "../lib/constants";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";
  import VendorDetailPanel from "./VendorDetailPanel.svelte";
  import VendorIcon from "./VendorIcon.svelte";

  const vendorList = $derived(managedVendorList(store.profiles));
  let autoRefreshActive = false;
  let autoRefreshOllamaInstalled = false;

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("profiles.title"),
      description: t("profiles.description"),
      addSubscription: t("vendorDetail.addSubscription"),
      editConnection: t("vendorDetail.editConnection"),
      addModel: t("common.addModel"),
      cancel: t("common.cancel"),
    };
  });

  $effect(() => {
    const ollamaInstalled = store.ollamaInstalled;
    if (store.activeTab !== "profiles") {
      autoRefreshActive = false;
      return;
    }
    if (!vendorList.length) return;
    if (autoRefreshOllamaInstalled !== ollamaInstalled) {
      autoRefreshActive = false;
    }
    if (autoRefreshActive) return;
    autoRefreshActive = true;
    autoRefreshOllamaInstalled = ollamaInstalled;
    const vendors = [...vendorList];
    window.setTimeout(() => {
      for (const vendor of vendors) {
        if (vendor.kind === "subscription") {
          const hasAccounts = store.subscriptionAccounts.some(
            (account) => account.providerId === vendor.subscriptionProviderId,
          );
          if (hasAccounts) {
            void refreshSubscriptionAccountModels(vendor.subscriptionProviderId, vendor.name);
          }
          continue;
        }
        if (canFetchModels(vendor)) void fetchVendorModels(vendor.name, { silent: true });
      }
    }, 0);
  });

  function canFetchModels(vendor: (typeof vendorList)[number]) {
    if (!canFetchVendorModels(vendor)) return false;
    if (vendor.kind === "subscription") {
      return subscriptionIsUsable(subscriptionStatusForVendor(vendor, store.subscriptions));
    }
    if (vendor.kind === "local" && vendor.localProvider === "ollama") {
      return store.ollamaInstalled;
    }
    return vendor.kind !== "local";
  }

  function summaryLine(vendor: (typeof vendorList)[number]) {
    const proxyUrl = vendorProxyBaseUrl(vendor);
    if (proxyUrl) return proxyUrl;
    const sub = subscriptionStatusForVendor(vendor, store.subscriptions);
    const base = vendorSummaryLine(vendor, sub, store.ollamaInstalled);
    const usage = vendorUsageSummaryForVendor(vendor, store.subscriptions);
    return usage ? `${base} · ${usage}` : base;
  }

  function vendorProxyBaseUrl(vendor: (typeof vendorList)[number]) {
    const providerId = providerIdForVendor(vendor);
    if (!providerId) return "";
    return buildProxyIngressBaseURL(store.proxyPort, providerId, store.proxyHost);
  }
</script>

<SectionCard title={copy.title} description={copy.description} fill>
  {#each vendorList as vendor (vendor.name)}
    <div class="border-b border-border last:border-b-0">
      <ListRow
        title={displayVendorName(vendor.name)}
        lines={[summaryLine(vendor)]}
        centerContent
      >
        {#snippet leading()}
          <VendorIcon providerId={providerIdForVendor(vendor)} />
        {/snippet}
        {#snippet actions()}
          {#if vendor.kind === "subscription"}
            {#if isSubscriptionLogging(vendor.subscriptionProviderId)}
              <Button size="sm" variant="outline" onclick={() => void cancelSubscriptionLogin(vendor.subscriptionProviderId)}>
                {copy.cancel}
              </Button>
            {:else}
              <Button size="sm" onclick={() => void addSubscriptionAccount(vendor.subscriptionProviderId)}>
                {copy.addSubscription}
              </Button>
            {/if}
          {:else if isOllamaVendor(vendor)}
            <Button
              size="sm"
              variant="outline"
              disabled={store.running}
              onclick={() => openProfileDialog("edit", OLLAMA_PROFILE_NAME)}
            >
              {copy.editConnection}
            </Button>
          {:else if canManuallyManageVendorModels(vendor)}
            <Button
              size="sm"
              variant="outline"
              disabled={store.running}
              onclick={() => openModelDialog("create", vendor.name)}
            >
              {copy.addModel}
            </Button>
          {/if}
        {/snippet}
      </ListRow>
      <VendorDetailPanel vendor={vendor} />
    </div>
  {/each}
</SectionCard>

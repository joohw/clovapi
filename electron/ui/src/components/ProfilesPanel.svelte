<script lang="ts">
  import {
    managedVendorList,
    providerIdForVendor,
    subscriptionIsUsable,
    subscriptionStatusForVendor,
    vendorSummaryLine,
  } from "../lib/helpers";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import {
    canFetchVendorModels,
    fetchVendorModels,
    store,
    vendorUsageSummaryForVendor,
  } from "../lib/store.svelte";
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
    const sub = subscriptionStatusForVendor(vendor, store.subscriptions);
    const base = vendorSummaryLine(vendor, sub, store.ollamaInstalled);
    const usage = vendorUsageSummaryForVendor(vendor, store.subscriptions);
    return usage ? `${base} · ${usage}` : base;
  }
</script>

<SectionCard title={copy.title} description={copy.description}>
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
      </ListRow>
      <VendorDetailPanel vendor={vendor} />
    </div>
  {/each}
</SectionCard>

<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import {
    managedVendorList,
    resolveVendorByName,
    providerIdForVendor,
    subscriptionStatusForVendor,
    vendorSummaryLine,
    subscriptionIsUsable,
  } from "../lib/helpers";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import {
    closeProfilesVendor,
    fetchVendorModels,
    openProfilesVendor,
    queryVendorUsage,
    store,
    vendorUsageSummary,
    canFetchVendorModels,
  } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";
  import VendorIcon from "./VendorIcon.svelte";
  import VendorDetailPanel from "./VendorDetailPanel.svelte";

  const vendorList = $derived(managedVendorList(store.profiles));
  const selectedVendorName = $derived(store.profilesSelectedVendor);
  const selectedVendor = $derived(
    selectedVendorName ? resolveVendorByName(store.profiles, selectedVendorName) : undefined,
  );
  const inVendorDetail = $derived(Boolean(selectedVendorName));
  let autoRefreshActive = false;

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      back: t("common.back"),
      title: t("profiles.title"),
      description: t("profiles.description"),
    };
  });

  $effect(() => {
    if (selectedVendorName && !selectedVendor) {
      closeProfilesVendor();
    }
  });

  $effect(() => {
    if (store.activeTab !== "profiles") {
      autoRefreshActive = false;
      return;
    }
    if (!vendorList.length) return;
    if (autoRefreshActive) return;
    autoRefreshActive = true;
    const vendors = [...vendorList];
    window.setTimeout(() => {
      for (const vendor of vendors) {
        if (canFetchModels(vendor)) void fetchVendorModels(vendor.name, { silent: true });
        if (canQueryUsage(vendor)) void queryVendorUsage(vendor, { silent: true });
      }
    }, 0);
  });

  function canFetchModels(vendor: (typeof vendorList)[number]) {
    if (!canFetchVendorModels(vendor)) return false;
    if (vendor.kind === "subscription") {
      return subscriptionIsUsable(subscriptionStatusForVendor(vendor, store.subscriptions));
    }
    return vendor.kind !== "local" || vendor.localProvider === "ollama";
  }

  function canQueryUsage(vendor: (typeof vendorList)[number]) {
    if (vendor.kind === "subscription") {
      return subscriptionStatusForVendor(vendor, store.subscriptions)?.active === true;
    }
    if (vendor.kind === "api") {
      return Boolean((vendor.baseUrl && vendor.apiKey) || vendor.models?.some((model) => model.baseUrl && model.apiKey));
    }
    return false;
  }

  function summaryLine(vendor: (typeof vendorList)[number]) {
    const sub = subscriptionStatusForVendor(vendor, store.subscriptions);
    const base = vendorSummaryLine(vendor, sub, store.ollamaInstalled);
    const usage = vendor.kind === "api" || vendor.kind === "subscription" ? vendorUsageSummary(vendor.name) : "";
    return usage ? `${base} · ${usage}` : base;
  }

  function openVendor(name: string) {
    openProfilesVendor(name);
  }

  function goBack() {
    closeProfilesVendor();
  }
</script>

{#if inVendorDetail && selectedVendor}
  <div class="flex flex-col gap-4">
    <Button size="sm" variant="outline" class="w-fit" type="button" onclick={goBack}>
      <ArrowLeftIcon class="size-4" />
      {copy.back}
    </Button>
    <VendorDetailPanel vendor={selectedVendor} />
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <SectionCard title={copy.title} description={copy.description}>
      {#each vendorList as vendor (vendor.name)}
        <ListRow
          title={displayVendorName(vendor.name)}
          lines={[summaryLine(vendor)]}
          onOpen={() => openVendor(vendor.name)}
          centerContent
          stopActionsPropagation={false}
        >
          {#snippet leading()}
            <VendorIcon providerId={providerIdForVendor(vendor)} />
          {/snippet}
          {#snippet actions()}
            <ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
          {/snippet}
        </ListRow>
      {/each}
    </SectionCard>
  </div>
{/if}

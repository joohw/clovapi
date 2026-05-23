<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import {
    managedVendorList,
    resolveVendorByName,
    subscriptionStatusForVendor,
    vendorSummaryLine,
  } from "../lib/helpers";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import { closeProfilesVendor, openProfilesVendor, store } from "../lib/store.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";
  import VendorDetailPanel from "./VendorDetailPanel.svelte";

  const vendorList = $derived(managedVendorList(store.profiles));
  const selectedVendorName = $derived(store.profilesSelectedVendor);
  const selectedVendor = $derived(
    selectedVendorName ? resolveVendorByName(store.profiles, selectedVendorName) : undefined,
  );
  const inVendorDetail = $derived(Boolean(selectedVendorName));

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      back: t("common.back"),
      manage: t("common.manage"),
      title: t("profiles.title"),
      description: t("profiles.description"),
    };
  });

  $effect(() => {
    if (selectedVendorName && !selectedVendor) {
      closeProfilesVendor();
    }
  });

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
        {@const sub = subscriptionStatusForVendor(vendor, store.subscriptions)}
        <ListRow
          title={displayVendorName(vendor.name)}
          lines={[vendorSummaryLine(vendor, sub, store.ollamaInstalled)]}
          onOpen={() => openVendor(vendor.name)}
        >
          {#snippet actions()}
            <Button size="sm" variant="outline" type="button" onclick={() => openVendor(vendor.name)}>
              {copy.manage}
              <ChevronRightIcon class="size-4" />
            </Button>
          {/snippet}
        </ListRow>
      {/each}
    </SectionCard>
  </div>
{/if}

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
      返回
    </Button>
    <VendorDetailPanel vendor={selectedVendor} />
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <SectionCard
      title="供应商"
      description="官方订阅、Ollama 与自定义 API；自定义 API 下每条模型单独配置网关地址与 Key。"
    >
      {#each vendorList as vendor (vendor.name)}
        {@const sub = subscriptionStatusForVendor(vendor, store.subscriptions)}
        <ListRow
          title={vendor.name}
          lines={[vendorSummaryLine(vendor, sub, store.ollamaInstalled)]}
          onOpen={() => openVendor(vendor.name)}
        >
          {#snippet actions()}
            <Button size="sm" variant="outline" type="button" onclick={() => openVendor(vendor.name)}>
              管理
              <ChevronRightIcon class="size-4" />
            </Button>
          {/snippet}
        </ListRow>
      {/each}
    </SectionCard>
  </div>
{/if}

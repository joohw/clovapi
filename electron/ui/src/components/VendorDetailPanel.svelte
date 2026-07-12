<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import type { Vendor } from "../global";
  import {
    removeSubscriptionAccount,
    reorderSubscriptionAccount,
    isSubscriptionAccountUsageLoading,
    querySubscriptionAccountUsage,
    subscriptionAccountUsageSummary,
    subscriptionAccountsForProvider,
  } from "../lib/store.svelte";

  let { vendor }: { vendor: Vendor } = $props();

  const subscriptionAccounts = $derived(
    vendor.kind === "subscription" ? subscriptionAccountsForProvider(vendor.subscriptionProviderId) : [],
  );
  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      cancel: t("common.cancel"),
      noSubscriptions: t("vendorDetail.noSubscriptions"),
      removeSubscription: t("vendorDetail.removeSubscription"),
      allowance: t("vendorDetail.allowance"),
      loading: t("common.loading"),
    };
  });

  let draggingAccountId = "";
  const queriedUsageAccounts = new Set<string>();

  $effect(() => {
    if (vendor.kind !== "subscription") return;
    for (const account of subscriptionAccounts) {
      const queryKey = `${account.id}\u0000${account.credentialRef}`;
      if (!account.id || !account.credentialRef || queriedUsageAccounts.has(queryKey)) continue;
      queriedUsageAccounts.add(queryKey);
      void querySubscriptionAccountUsage(vendor, account, { silent: true });
    }
  });

  function accountUsageText(accountId: string): string {
    return subscriptionAccountUsageSummary(accountId)
      || (isSubscriptionAccountUsageLoading(accountId) ? copy.loading : t("vendorDetail.usageEmpty"));
  }

  function onAccountDrop(targetAccountId: string) {
    const fromIndex = subscriptionAccounts.findIndex((account) => account.id === draggingAccountId);
    const toIndex = subscriptionAccounts.findIndex((account) => account.id === targetAccountId);
    draggingAccountId = "";
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    void reorderSubscriptionAccount(vendor.subscriptionProviderId, fromIndex, toIndex);
  }
</script>

<div class="ml-[4.25rem] mr-4 px-0">
  {#if vendor.kind !== "subscription"}
    <div class="min-h-6"></div>
  {:else}
    <div class="w-full divide-y divide-border" role="list">
      {#if subscriptionAccounts.length === 0}
        <div class="py-2 text-xs text-muted-foreground">
          {copy.noSubscriptions}
        </div>
      {:else}
        {#each subscriptionAccounts as account, index (account.id)}
          <div
            role="listitem"
            class="flex items-center gap-3 py-3"
            draggable="true"
            ondragstart={() => (draggingAccountId = account.id)}
            ondragover={(event) => event.preventDefault()}
            ondrop={() => onAccountDrop(account.id)}
          >
            <span class="mt-1 cursor-grab select-none text-muted-foreground" aria-hidden="true">⋮⋮</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{account.label || `${displayVendorName(vendor.name)} ${index + 1}`}</div>
              <div class="mt-1 truncate text-xs text-muted-foreground">
                {copy.allowance}: {accountUsageText(account.id)}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onclick={() => void removeSubscriptionAccount(vendor.subscriptionProviderId, account.id)}
            >
              {copy.removeSubscription}
            </Button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

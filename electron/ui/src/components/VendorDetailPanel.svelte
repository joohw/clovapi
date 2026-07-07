<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    buildProxyIngressBaseURL,
    canManuallyManageVendorModels,
    isOllamaVendor,
    providerIdForVendor,
    subscriptionIsUsable,
  } from "../lib/helpers";
  import { copyTextWithToast } from "../lib/clipboard";
  import { OLLAMA_PROFILE_NAME } from "../lib/constants";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import type { Vendor } from "../global";
  import {
    cancelSubscriptionLogin,
    isSubscriptionLogging,
    openModelDialog,
    openProfileDialog,
    runSubscriptionLogin,
    runSubscriptionLogout,
    store,
    subscriptionStatusForProvider,
  } from "../lib/store.svelte";

  let { vendor }: { vendor: Vendor } = $props();

  const subscription = $derived(
    vendor.kind === "subscription"
      ? subscriptionStatusForProvider(vendor.subscriptionProviderId)
      : undefined,
  );
  const logging = $derived(
    vendor.kind === "subscription" ? isSubscriptionLogging(vendor.subscriptionProviderId) : false,
  );
  const subscriptionUsable = $derived(
    vendor.kind !== "subscription" || subscriptionIsUsable(subscription),
  );
  const localRuntimeUsable = $derived(!isOllamaVendor(vendor) || store.ollamaInstalled);
  const vendorUsable = $derived(subscriptionUsable && localRuntimeUsable);

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      cancel: t("common.cancel"),
      login: t("common.login"),
      logout: t("common.logout"),
      editConnection: t("vendorDetail.editConnection"),
      addModel: t("common.addModel"),
      proxyBaseUrl: t("vendorDetail.proxyBaseUrl"),
      clickToCopy: t("app.clickToCopyProxyBaseUrl"),
    };
  });

  const vendorProviderId = $derived(providerIdForVendor(vendor));
  const vendorProxyBaseUrl = $derived(
    vendorProviderId && vendorUsable
      ? buildProxyIngressBaseURL(store.proxyPort, vendorProviderId, store.proxyHost)
      : "",
  );

  async function copyVendorProxyBaseUrl() {
    if (!vendorProxyBaseUrl) return;
    await copyTextWithToast(vendorProxyBaseUrl);
  }
</script>

<div class="ml-[4.25rem] mr-4 px-0 py-3">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="min-w-0">
      {#if vendorProxyBaseUrl}
        <button
          type="button"
          class="flex w-full min-w-0 items-center gap-2 text-left text-xs opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          onclick={() => void copyVendorProxyBaseUrl()}
          title={copy.clickToCopy}
          aria-label={`${copy.proxyBaseUrl}: ${vendorProxyBaseUrl}. ${copy.clickToCopy}`}
        >
          <span class="shrink-0 text-muted-foreground">{copy.proxyBaseUrl}</span>
          <span class="min-w-0 truncate font-mono text-foreground">{vendorProxyBaseUrl}</span>
        </button>
      {/if}
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
      {#if vendor.kind === "subscription" && subscription}
        {#if logging}
          <Button size="sm" variant="outline" onclick={() => void cancelSubscriptionLogin(subscription.id)}>
            {copy.cancel}
          </Button>
        {:else}
          <Button size="sm" onclick={() => void runSubscriptionLogin(subscription.id)}>
            {copy.login}
          </Button>
        {/if}
        <Button
          size="sm"
          variant="outline"
          disabled={!subscription.loggedIn || logging}
          onclick={() => void runSubscriptionLogout(subscription.id, displayVendorName(vendor.name))}
        >
          {copy.logout}
        </Button>
      {/if}
      {#if vendor.kind === "local"}
        <Button
          size="sm"
          variant="outline"
          disabled={store.running}
          onclick={() => openProfileDialog("edit", OLLAMA_PROFILE_NAME)}
        >
          {copy.editConnection}
        </Button>
      {/if}
      {#if canManuallyManageVendorModels(vendor)}
        <Button
          size="sm"
          variant="outline"
          disabled={store.running}
          onclick={() => openModelDialog("create", vendor.name)}
        >
          {copy.addModel}
        </Button>
      {/if}
    </div>
  </div>
</div>

<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    modelBindingValue,
    modelTestStatusKey,
    canManuallyManageVendorModels,
    customApiModelLine,
    isDefaultCustomApiProfile,
    isOllamaVendor,
    providerIdForVendor,
    subscriptionIsUsable,
    vendorKindLabel,
  } from "../lib/helpers";
  import { OLLAMA_PROFILE_NAME } from "../lib/constants";
  import { displayVendorName, formatSubscriptionSummary, i18n, t } from "../lib/i18n";
  import type { ModelTestStatus, Vendor } from "../global";
  import {
    canFetchVendorModels,
    fetchVendorModels,
    getModelTest,
    isModelTesting,
    isSubscriptionLogging,
    isVendorFetching,
    openModelDialog,
    openProfileDialog,
    queryVendorUsage,
    vendorUsageSummary,
    isVendorUsageLoading,
    removeVendorModel,
    runModelTest,
    runSubscriptionLogin,
    runSubscriptionLogout,
    cancelSubscriptionLogin,
    subscriptionStatusForProvider,
    store,
  } from "../lib/store.svelte";
  import { formatModelTestSummary } from "../lib/store/model-tests";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";

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
  const visibleModels = $derived(subscriptionUsable ? vendor.models || [] : []);

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      cancel: t("common.cancel"),
      login: t("common.login"),
      logout: t("common.logout"),
      fetchModels: t("common.fetchModels"),
      fetching: t("common.fetching"),
      editConnection: t("vendorDetail.editConnection"),
      addModel: t("common.addModel"),
      edit: t("common.edit"),
      test: t("common.test"),
      testing: t("common.testing"),
      delete: t("common.delete"),
      loginFirst: t("subscription.loginFirst"),
      testConnectivity: t("subscription.testConnectivity"),
      emptyCustom: t("vendorDetail.emptyCustom"),
      emptySubscriptionNeedLogin: t("vendorDetail.emptySubscriptionNeedLogin"),
      emptySubscriptionUnavailable: t("vendorDetail.emptySubscriptionUnavailable"),
      emptySubscription: t("vendorDetail.emptySubscription"),
      emptyMixed: t("vendorDetail.emptyMixed"),
      installed: t("vendorDetail.installed"),
      notInstalled: t("vendorDetail.notInstalled"),
      queryUsage: t("vendorDetail.queryUsage"),
      queryingUsage: t("vendorDetail.queryingUsage"),
    };
  });

  const cardDescription = $derived.by(() => {
    void i18n.locale;
    if (vendor.kind === "subscription") {
      return formatSubscriptionSummary(subscription?.summary || "");
    }
    if (isOllamaVendor(vendor)) {
      return store.ollamaInstalled ? copy.installed : copy.notInstalled;
    }
    if (vendor.kind === "api") {
      const usage = vendorUsageSummary(vendor.name);
      if (usage) return usage;
    }
    return vendorKindLabel(vendor);
  });

  function modelTestStatus(value: string | undefined): "" | ModelTestStatus {
    if (value === "testing" || value === "pass" || value === "fail") return value;
    return "";
  }

  function modelTestUi(binding: string) {
    const entry = getModelTest(modelTestStatusKey(binding));
    if (!entry) {
      return { status: "" as const, summary: "", detail: "" };
    }
    return {
      status: modelTestStatus(entry.status),
      summary: formatModelTestSummary(entry),
      detail: "",
    };
  }

  const isCustomApi = $derived(isDefaultCustomApiProfile(vendor.name));
  const showFetchModels = $derived(canFetchVendorModels(vendor));
</script>

<SectionCard title={displayVendorName(vendor.name)} description={cardDescription}>
  {#snippet actions()}
    {#if vendor.kind === "subscription" && subscription}
      {#if logging}
        <Button size="sm" variant="outline" onclick={() => void cancelSubscriptionLogin(subscription.id)}>
          {copy.cancel}
        </Button>
      {:else}
        <Button
          size="sm"
          disabled={!subscription.installed}
          onclick={() => void runSubscriptionLogin(subscription.id)}
        >
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
    {#if showFetchModels}
      <Button
        size="sm"
        variant="outline"
        disabled={store.running || isVendorFetching(vendor.name) || !subscriptionUsable}
        onclick={() => void fetchVendorModels(vendor.name)}
      >
        {isVendorFetching(vendor.name) ? copy.fetching : copy.fetchModels}
      </Button>
    {/if}
    {#if vendor.kind === "api" && vendor.baseUrl && vendor.apiKey}
      <Button
        size="sm"
        variant="outline"
        disabled={store.running || isVendorUsageLoading(vendor.name)}
        onclick={() => void queryVendorUsage(vendor)}
      >
        {isVendorUsageLoading(vendor.name) ? copy.queryingUsage : copy.queryUsage}
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
  {/snippet}
  {#if !visibleModels.length}
    <p class="px-4 py-6 text-center text-sm text-muted-foreground">
      {#if isCustomApi}
        {copy.emptyCustom}
      {:else if !canManuallyManageVendorModels(vendor)}
        {#if vendor.kind === "subscription" && subscription && !subscriptionUsable && !logging}
          {subscription.loggedIn ? copy.emptySubscriptionUnavailable : copy.emptySubscriptionNeedLogin}
        {:else}
          {copy.emptySubscription}
        {/if}
      {:else}
        {copy.emptyMixed}
      {/if}
    </p>
  {:else}
    {#each visibleModels as model (model.id)}
      {@const binding = modelBindingValue(providerIdForVendor(vendor), model.id)}
      {@const testKey = modelTestStatusKey(binding)}
      {@const test = modelTestUi(binding)}
      {@const testing = isModelTesting(testKey)}
      <ListRow
        title={model.label || model.model}
        lines={[isCustomApi ? customApiModelLine(model) : `${model.model} · ${model.apiStyle}`]}
        showStatusDot
        testStatus={test.status}
        testSummary={test.summary}
      >
        {#snippet actions()}
          {#if canManuallyManageVendorModels(vendor)}
            <Button
              size="sm"
              variant="outline"
              disabled={store.running || testing}
              onclick={() => openModelDialog("edit", vendor.name, model.id)}
            >
              {copy.edit}
            </Button>
          {/if}
          <Button
            size="sm"
            variant="outline"
            disabled={store.running || testing || (vendor.kind === "subscription" && (!subscriptionUsable || logging))}
            title={vendor.kind === "subscription" && !subscriptionUsable ? copy.loginFirst : copy.testConnectivity}
            onclick={() => void runModelTest(binding)}
          >
            {testing ? copy.testing : copy.test}
          </Button>
          {#if canManuallyManageVendorModels(vendor)}
            <Button
              size="sm"
              variant="destructive"
              disabled={store.running || testing}
              onclick={() => void removeVendorModel(vendor.name, model.id)}
            >
              {copy.delete}
            </Button>
          {/if}
        {/snippet}
      </ListRow>
    {/each}
  {/if}
</SectionCard>

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
  import { cn } from "../lib/utils";
  import type { ModelTestStatus, Vendor } from "../global";
  import {
    getModelTest,
    isModelTesting,
    isSubscriptionLogging,
    openModelDialog,
    openProfileDialog,
    vendorUsageSummary,
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
  import VendorIcon from "./VendorIcon.svelte";

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
      editConnection: t("vendorDetail.editConnection"),
      addModel: t("common.addModel"),
      edit: t("common.edit"),
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
      modelCount: t("vendorDetail.modelCount", { count: visibleModels.length }),
    };
  });

  const cardDescription = $derived.by(() => {
    void i18n.locale;
    const usage = vendor.kind === "api" || vendor.kind === "subscription" ? vendorUsageSummary(vendor.name) : "";
    const parts: string[] = [];
    if (vendor.kind === "subscription") {
      parts.push(formatSubscriptionSummary(subscription?.summary || ""));
    } else if (isOllamaVendor(vendor)) {
      parts.push(store.ollamaInstalled ? copy.installed : copy.notInstalled);
    } else {
      parts.push(vendorKindLabel(vendor));
    }
    parts.push(copy.modelCount);
    if (usage) parts.push(usage);
    return parts.filter(Boolean).join(" · ");
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

  function modelTestDotClass(status: "" | ModelTestStatus) {
    return cn(
      "size-1.5 shrink-0 rounded-full",
      status === "pass" && "bg-emerald-500",
      status === "fail" && "bg-red-500",
      status === "testing" && "animate-pulse bg-amber-500",
      status !== "pass" && status !== "fail" && status !== "testing" && "bg-muted-foreground/40",
    );
  }

  function modelTestSummaryClass(status: "" | ModelTestStatus) {
    return cn(
      "max-w-36 truncate text-xs font-normal leading-none",
      status === "pass" && "text-emerald-600 dark:text-emerald-400",
      status === "fail" && "text-red-600 dark:text-red-400",
      status === "testing" && "text-amber-600 dark:text-amber-400",
      status !== "pass" && status !== "fail" && status !== "testing" && "text-muted-foreground",
    );
  }

  function canRunModelTest(testing: boolean) {
    return !store.running && !testing && !(vendor.kind === "subscription" && (!subscriptionUsable || logging));
  }

  function runModelTestFromRow(binding: string, testing: boolean) {
    if (!canRunModelTest(testing)) return;
    void runModelTest(binding);
  }

  const isCustomApi = $derived(isDefaultCustomApiProfile(vendor.name));
</script>

<SectionCard title={displayVendorName(vendor.name)} description={cardDescription}>
  {#snippet leading()}
    <VendorIcon providerId={providerIdForVendor(vendor)} />
  {/snippet}
  {#snippet actions()}
    {#if vendor.kind === "subscription" && subscription}
      {#if logging}
        <Button size="sm" variant="outline" onclick={() => void cancelSubscriptionLogin(subscription.id)}>
          {copy.cancel}
        </Button>
      {:else}
        <Button
          size="sm"
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
        testStatus={test.status}
        onDoubleClick={() => runModelTestFromRow(binding, testing)}
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
          <span
            class="flex h-8 min-w-8 shrink-0 items-center justify-center gap-2 rounded-md px-2"
            title={vendor.kind === "subscription" && !subscriptionUsable ? copy.loginFirst : test.summary || copy.testConnectivity}
            aria-label={test.summary || copy.testConnectivity}
          >
            <span class={modelTestDotClass(test.status)} aria-hidden="true"></span>
            {#if test.summary}
              <span class={modelTestSummaryClass(test.status)}>{test.summary}</span>
            {/if}
          </span>
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

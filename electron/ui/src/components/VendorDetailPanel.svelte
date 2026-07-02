<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    buildProxyIngressBaseURL,
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
  import { copyTextWithToast } from "../lib/clipboard";
  import { OLLAMA_PROFILE_NAME } from "../lib/constants";
  import { displayVendorName, formatSubscriptionSummary, i18n, t } from "../lib/i18n";
  import type { ModelTestStatus, Vendor, VendorModel } from "../global";
  import {
    getModelTest,
    isModelTesting,
    isSubscriptionLogging,
    openModelDialog,
    openProfileDialog,
    vendorUsageSummaryForVendor,
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
  const localRuntimeUsable = $derived(!isOllamaVendor(vendor) || store.ollamaInstalled);
  const vendorUsable = $derived(subscriptionUsable && localRuntimeUsable);
  const visibleModels = $derived(vendorUsable ? vendor.models || [] : []);

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
      emptyOllamaUnavailable: t("vendorDetail.emptyOllamaUnavailable"),
      emptySubscription: t("vendorDetail.emptySubscription"),
      emptyMixed: t("vendorDetail.emptyMixed"),
      installed: t("vendorDetail.installed"),
      notInstalled: t("vendorDetail.notInstalled"),
      modelCount: t("vendorDetail.modelCount", { count: visibleModels.length }),
      proxyBaseUrl: t("vendorDetail.proxyBaseUrl"),
      clickToCopy: t("app.clickToCopyProxyBaseUrl"),
      modelRowHint: t("vendorDetail.modelRowHint"),
    };
  });

  const vendorProviderId = $derived(providerIdForVendor(vendor));
  const vendorProxyBaseUrl = $derived(
    vendorProviderId && vendorUsable ? buildProxyIngressBaseURL(store.proxyPort, vendorProviderId, store.proxyHost) : "",
  );

  async function copyVendorProxyBaseUrl() {
    if (!vendorProxyBaseUrl) return;
    await copyTextWithToast(vendorProxyBaseUrl);
  }

  const cardDescription = $derived.by(() => {
    void i18n.locale;
    const usage = vendorUsageSummaryForVendor(vendor, store.subscriptions);
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

  function canRunModelTest(testing: boolean) {
    return !store.running && !testing && vendorUsable && !(vendor.kind === "subscription" && logging);
  }

  function runModelTestFromRow(binding: string, testing: boolean) {
    if (!canRunModelTest(testing)) return;
    void runModelTest(binding);
  }

  const MODEL_COPY_DELAY_MS = 400;
  let modelCopyTimer: ReturnType<typeof setTimeout> | undefined;
  let modelCopyGeneration = 0;

  function modelNameToCopy(model: VendorModel): string {
    return String(model.model || model.label || "").trim();
  }

  function cancelModelCopy() {
    clearTimeout(modelCopyTimer);
    modelCopyTimer = undefined;
    modelCopyGeneration += 1;
  }

  function onModelRowClick(model: VendorModel, event: MouseEvent) {
    if (event.detail > 1) {
      cancelModelCopy();
      return;
    }
    const name = modelNameToCopy(model);
    if (!name) return;
    cancelModelCopy();
    const generation = modelCopyGeneration;
    modelCopyTimer = setTimeout(() => {
      if (generation !== modelCopyGeneration) return;
      modelCopyTimer = undefined;
      void copyTextWithToast(name, { success: t("toast.modelNameCopied") });
    }, MODEL_COPY_DELAY_MS);
  }

  function onModelRowDoubleClick(binding: string, testing: boolean) {
    cancelModelCopy();
    runModelTestFromRow(binding, testing);
  }

  const isCustomApi = $derived(isDefaultCustomApiProfile(vendor.name));
</script>

<SectionCard title={displayVendorName(vendor.name)} description={cardDescription}>
  {#snippet headerMeta()}
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
  {/snippet}
  {#snippet leading()}
    <VendorIcon
      providerId={providerIdForVendor(vendor)}
      class="!size-auto h-full max-h-[4.25rem] min-h-[3.25rem] w-auto max-w-[4.25rem] aspect-square p-2"
    />
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
        {#if isOllamaVendor(vendor) && !store.ollamaInstalled}
          {copy.emptyOllamaUnavailable}
        {:else if vendor.kind === "subscription" && subscription && !subscriptionUsable && !logging}
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
        showStatusDot={Boolean(test.status || test.summary)}
        testStatus={test.status}
        testSummary={test.summary}
        rowTitle={copy.modelRowHint}
        onClick={(event) => onModelRowClick(model, event)}
        onDoubleClick={() => onModelRowDoubleClick(binding, testing)}
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

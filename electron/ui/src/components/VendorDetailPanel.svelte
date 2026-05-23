<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    modelBindingValue,
    modelTestStatusKey,
    canManuallyManageVendorModels,
    customApiModelLine,
    isDefaultCustomApiProfile,
    isOllamaVendor,
    vendorKindLabel,
  } from "../lib/helpers";
  import { OLLAMA_PROFILE_NAME } from "../lib/constants";
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

<SectionCard
  title={vendor.name}
  description={vendor.kind === "subscription"
    ? subscription?.summary || "未登录"
    : isOllamaVendor(vendor)
      ? store.ollamaInstalled
        ? "已安装"
        : "未安装"
      : vendorKindLabel(vendor)}
>
  {#snippet actions()}
    {#if vendor.kind === "subscription" && subscription}
      {#if logging}
        <Button size="sm" variant="outline" onclick={() => void cancelSubscriptionLogin(subscription.id)}>
          取消
        </Button>
      {:else}
        <Button
          size="sm"
          disabled={!subscription.installed}
          onclick={() => void runSubscriptionLogin(subscription.id)}
        >
          登录
        </Button>
      {/if}
      <Button
        size="sm"
        variant="outline"
        disabled={!subscription.loggedIn || logging}
        onclick={() => void runSubscriptionLogout(subscription.id, subscription.label)}
      >
        退出
      </Button>
    {/if}
    {#if showFetchModels}
      <Button
        size="sm"
        variant="outline"
        disabled={store.running || isVendorFetching(vendor.name)}
        onclick={() => void fetchVendorModels(vendor.name)}
      >
        {isVendorFetching(vendor.name) ? "拉取中…" : "拉取模型"}
      </Button>
    {/if}
    {#if vendor.kind === "local"}
      <Button
        size="sm"
        variant="outline"
        disabled={store.running}
        onclick={() => openProfileDialog("edit", OLLAMA_PROFILE_NAME)}
      >
        编辑连接
      </Button>
    {/if}
    {#if canManuallyManageVendorModels(vendor)}
      <Button
        size="sm"
        variant="outline"
        disabled={store.running}
        onclick={() => openModelDialog("create", vendor.name)}
      >
        添加模型
      </Button>
    {/if}
  {/snippet}
  {#if !vendor.models?.length}
    <p class="px-4 py-6 text-center text-sm text-muted-foreground">
      {#if isCustomApi}
        尚未添加模型，请点击上方「添加模型」。
      {:else if !canManuallyManageVendorModels(vendor)}
        {#if vendor.kind === "subscription" && subscription && !subscription.loggedIn && !logging}
          尚未拉取模型，请先登录后再点击上方「拉取模型」。
        {:else}
          尚未拉取模型，请点击上方「拉取模型」。
        {/if}
      {:else}
        尚未添加模型。可拉取或手动添加。
      {/if}
    </p>
  {:else}
    {#each vendor.models as model (model.id)}
      {@const binding = modelBindingValue(vendor.name, model.id)}
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
              编辑
            </Button>
          {/if}
          <Button
            size="sm"
            variant="outline"
            disabled={store.running || testing || (vendor.kind === "subscription" && (!subscription?.loggedIn || logging))}
            title={vendor.kind === "subscription" && !subscription?.loggedIn ? "请先登录" : "测试连通性"}
            onclick={() => void runModelTest(binding)}
          >
            {testing ? "测试中…" : "测试"}
          </Button>
          {#if canManuallyManageVendorModels(vendor)}
            <Button
              size="sm"
              variant="destructive"
              disabled={store.running || testing}
              onclick={() => void removeVendorModel(vendor.name, model.id)}
            >
              删除
            </Button>
          {/if}
        {/snippet}
      </ListRow>
    {/each}
  {/if}
</SectionCard>

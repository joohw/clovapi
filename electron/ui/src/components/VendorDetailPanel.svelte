<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    modelBindingValue,
    modelTestStatusKey,
    canManuallyManageVendorModels,
    customApiModelLine,
    isDefaultCustomApiProfile,
    vendorKindLabel,
  } from "../lib/helpers";
  import { OLLAMA_PROFILE_NAME } from "../lib/constants";
  import type { Vendor } from "../global";
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

  function modelTestUi(binding: string) {
    const entry = getModelTest(modelTestStatusKey(binding));
    return {
      status: entry?.status || "",
      summary: entry?.summary || "",
      detail: entry?.detail || "",
    };
  }

  const isCustomApi = $derived(isDefaultCustomApiProfile(vendor.name));
  const showFetchModels = $derived(canFetchVendorModels(vendor));
</script>

<div class="flex flex-col gap-4">
  <SectionCard
    title={vendor.name}
    description={`${vendorKindLabel(vendor)}${subscription?.summary ? ` · ${subscription.summary}` : ""}`}
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
    {#if vendor.kind === "subscription" && subscription && !subscription.loggedIn && !logging}
      <p class="px-4 py-3 text-xs text-muted-foreground">请先登录后再测试模型。</p>
    {/if}
  </SectionCard>

  <SectionCard
    title="模型列表"
    description={isCustomApi
      ? "每条模型自带 API 地址与 Key；可在客户端管理中选择并应用。"
      : "每个模型对应一个 @model 绑定，可在客户端管理中选择并应用。"}
  >
    {#if !vendor.models?.length}
      <p class="px-4 py-6 text-center text-sm text-muted-foreground">
        {#if isCustomApi}
          尚未添加模型，请点击上方「添加模型」。
        {:else if !canManuallyManageVendorModels(vendor)}
          尚未拉取模型，请点击上方「拉取模型」。
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
          testDetail={test.detail}
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
</div>

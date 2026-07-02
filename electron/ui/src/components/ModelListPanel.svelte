<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { copyTextWithToast } from "../lib/clipboard";
  import { displayVendorName, i18n, t } from "../lib/i18n";
  import { setActiveTab, store } from "../lib/store.svelte";
  import type { ModelListItem } from "../global";
  import SectionCard from "./SectionCard.svelte";
  import VendorIcon from "./VendorIcon.svelte";

  type ModelGroup = {
    key: string;
    proxyBaseUrl: string;
    providerId: string;
    source: string;
    models: ModelListItem[];
  };

  const rows = $derived(store.modelList || []);

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("modelList.title"),
      description: t("modelList.description", { count: rows.length }),
      empty: t("modelList.empty"),
      provider: t("modelList.provider"),
      modelId: t("modelList.modelId"),
      apiStyle: t("modelList.apiStyle"),
      proxyBaseUrl: t("vendorDetail.proxyBaseUrl"),
      copyModel: t("modelList.copyModel"),
      copyProxy: t("modelList.copyProxy"),
      openProfiles: t("tabs.profiles"),
      modelCopied: t("toast.modelNameCopied"),
      proxyCopied: t("toast.proxyBaseUrlCopied"),
    };
  });

  function vendorKindLine(row: ModelListItem): string {
    if (row.vendorKind === "subscription") return t("vendorKind.subscription");
    if (row.vendorKind === "local") return t("vendorKind.local", { provider: row.providerId });
    return t("vendorKind.api");
  }

  const groups = $derived.by(() => {
    const grouped = new Map<string, ModelGroup>();
    for (const row of rows) {
      const proxyBaseUrl = String(row.proxyBaseUrl || "").trim();
      const key = proxyBaseUrl || `${row.providerId}/${row.vendorName}`;
      const source = `${displayVendorName(row.vendorName)} / ${vendorKindLine(row)} / ${copy.provider}: ${row.providerId}`;
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.source.includes(source)) existing.source = `${existing.source}, ${source}`;
        existing.models.push(row);
        continue;
      }
      grouped.set(key, {
        key,
        proxyBaseUrl,
        providerId: row.providerId,
        source,
        models: [row],
      });
    }
    return Array.from(grouped.values());
  });

  async function copyModel(row: ModelListItem) {
    const value = String(row.modelId || row.label || "").trim();
    if (!value) return;
    await copyTextWithToast(value, { success: copy.modelCopied });
  }

  async function copyProxyUrl(proxyBaseUrl: string) {
    const value = String(proxyBaseUrl || "").trim();
    if (!value) return;
    await copyTextWithToast(value, { success: copy.proxyCopied });
  }
</script>

<SectionCard title={copy.title} description={copy.description}>
  {#if !rows.length}
    <button
      type="button"
      class="flex w-full flex-col items-center gap-2 px-4 py-6 text-center text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      onclick={() => setActiveTab("profiles")}
    >
      <span class="text-muted-foreground">{copy.empty}</span>
      <span class="font-medium text-foreground">{copy.openProfiles}</span>
    </button>
  {:else}
    {#each groups as group (group.key)}
      <div class="border-b border-border last:border-b-0">
        <div class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3">
          <div class="self-center">
            <VendorIcon providerId={group.providerId} />
          </div>
          <div class="min-w-0 space-y-1">
            {#if group.proxyBaseUrl}
              <div class="flex min-w-0 items-baseline gap-1 text-sm font-medium leading-relaxed">
                <span class="shrink-0 text-muted-foreground">{copy.proxyBaseUrl}:</span>
                <span class="min-w-0 break-all">{group.proxyBaseUrl}</span>
              </div>
            {/if}
            <p class="break-all text-xs leading-relaxed text-muted-foreground">{group.source}</p>
          </div>
          {#if group.proxyBaseUrl}
            <Button
              size="icon-xs"
              variant="outline"
              type="button"
              class="shrink-0"
              aria-label={copy.copyProxy}
              title={copy.copyProxy}
              onclick={() => void copyProxyUrl(group.proxyBaseUrl)}
            >
              <CopyIcon class="size-3" />
            </Button>
          {:else}
            <div class="size-6" aria-hidden="true"></div>
          {/if}
        </div>

        <div class="border-t border-border" aria-hidden="true"></div>

        <div>
          {#each group.models as row, index (`${group.key}/${row.modelId}`)}
            {#if index > 0}
              <div class="ml-[4.25rem] mr-4 border-t border-border" aria-hidden="true"></div>
            {/if}
            <div class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-2.5">
              <div class="size-10" aria-hidden="true"></div>
              <div class="min-w-0 space-y-1">
                <div class="truncate text-sm font-medium leading-none">{row.label || row.modelId}</div>
                <div class="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4">
                  <span class="break-all">{copy.modelId}: {row.modelId}</span>
                  <span class="break-all">{copy.apiStyle}: {row.apiStyle}</span>
                </div>
              </div>
              <Button
                size="icon-xs"
                variant="outline"
                type="button"
                class="shrink-0"
                aria-label={copy.copyModel}
                title={copy.copyModel}
                onclick={() => void copyModel(row)}
              >
                <CopyIcon class="size-3" />
              </Button>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</SectionCard>

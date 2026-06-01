<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { cn } from "$lib/utils.js";
  import { i18n, t } from "../lib/i18n";
  import type { CliBindingOption } from "../lib/helpers";
  import VendorIcon from "./VendorIcon.svelte";

  let {
    options = [],
    value = "",
    disabled = false,
    onchange,
  }: {
    options: CliBindingOption[];
    value?: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
  } = $props();

  let open = $state(false);

  const placeholder = $derived.by(() => {
    void i18n.locale;
    return t("common.selectPlaceholder");
  });

  const selectedOption = $derived(options.find((o) => o.value === value));
  const triggerLabel = $derived(selectedOption?.triggerLabel ?? selectedOption?.label ?? placeholder);
  const isPlaceholder = $derived(!selectedOption);
  const optionTree = $derived.by(() => {
    const roots: CliBindingOption[] = [];
    const groups: { label: string; providerId: string; disabled: boolean; options: CliBindingOption[] }[] = [];
    const byLabel = new Map<string, { label: string; providerId: string; disabled: boolean; options: CliBindingOption[] }>();
    for (const opt of options) {
      const group = String(opt.group || "").trim();
      if (!group) {
        roots.push(opt);
        continue;
      }
      let item = byLabel.get(group);
      if (!item) {
        item = {
          label: group,
          providerId: String(opt.providerId || "").trim(),
          disabled: Boolean(opt.groupDisabled),
          options: [],
        };
        byLabel.set(group, item);
        groups.push(item);
      }
      if (!item.providerId && opt.providerId) item.providerId = String(opt.providerId).trim();
      if (opt.groupDisabled) item.disabled = true;
      if (!opt.groupOnly) item.options.push(opt);
    }
    return { roots, groups };
  });

  function selectValue(next: string) {
    onchange?.(next);
    open = false;
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    {disabled}
    class={cn(
      "border-input bg-background data-placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive h-9 min-w-[12rem] max-w-[20rem] gap-1.5 rounded-lg border py-2 pr-2 pl-2.5 text-sm shadow-none transition-colors select-none focus-visible:ring-3 aria-invalid:ring-3 flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50",
      !isPlaceholder && "text-foreground data-placeholder:text-foreground",
    )}
    title={triggerLabel}
  >
    <span class={cn("truncate", isPlaceholder && "text-muted-foreground")}>{triggerLabel}</span>
    <ChevronDownIcon class="text-muted-foreground size-4 pointer-events-none shrink-0" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content
    class="min-w-[12rem] max-w-[22rem]"
  >
    {#each optionTree.roots as opt (opt.value)}
      <DropdownMenu.Item
        disabled={opt.disabled}
        textValue={opt.label}
        onSelect={() => selectValue(opt.value)}
        title={opt.hint || opt.triggerLabel || opt.label}
      >
        <span class="truncate">{opt.label}</span>
        {#if opt.value === value}
          <CheckIcon class="absolute right-2 size-4" />
        {/if}
      </DropdownMenu.Item>
    {/each}

    {#if optionTree.roots.length && optionTree.groups.length}
      <DropdownMenu.Separator class="bg-border -mx-1 my-1 h-px pointer-events-none" />
    {/if}

    {#each optionTree.groups as group (group.label)}
      {@const groupUnavailable = group.disabled || !group.options.length}
      {#if groupUnavailable}
        <DropdownMenu.Item
          disabled
          textValue={group.label}
          onSelect={(event) => {
            event.preventDefault();
          }}
          class="cursor-not-allowed opacity-45"
        >
          {#if group.providerId}
            <VendorIcon providerId={group.providerId} class="size-5 rounded-md p-0.5" />
          {/if}
          <span class="truncate">{group.label}</span>
        </DropdownMenu.Item>
      {:else}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger
            textValue={group.label}
          >
            <span class="flex min-w-0 items-center gap-2">
              {#if group.providerId}
                <VendorIcon providerId={group.providerId} class="size-5 rounded-md p-0.5" />
              {/if}
              <span class="truncate">{group.label}</span>
            </span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            class="min-w-[12rem] max-w-[22rem] max-h-[min(20rem,var(--bits-floating-available-height))]"
          >
            {#each group.options as opt (opt.value)}
              <DropdownMenu.Item
                disabled={opt.disabled}
                textValue={opt.label}
                onSelect={() => selectValue(opt.value)}
                title={opt.hint || opt.triggerLabel || opt.label}
              >
                <span class="truncate">{opt.label}</span>
                {#if opt.value === value}
                  <CheckIcon class="absolute right-2 size-4" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      {/if}
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>

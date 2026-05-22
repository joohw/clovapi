<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import { cn } from "$lib/utils.js";

  export type SelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
    hint?: string;
  };

  let {
    options = [],
    value = $bindable(""),
    disabled = false,
    placeholder = "请选择",
    class: className = "",
    block = false,
    onchange,
  }: {
    options: SelectOption[];
    value?: string;
    disabled?: boolean;
    placeholder?: string;
    class?: string;
    block?: boolean;
    onchange?: (value: string) => void;
  } = $props();

  const selectedOption = $derived(options.find((o) => o.value === value));
  const triggerLabel = $derived(selectedOption?.label ?? placeholder);
  const isPlaceholder = $derived(!selectedOption);

  function handleValueChange(next: string | undefined) {
    const v = next ?? "";
    value = v;
    onchange?.(v);
  }
</script>

<Select.Root
  type="single"
  {disabled}
  allowDeselect={options.some((o) => o.value === "")}
  bind:value={value as never}
  onValueChange={handleValueChange}
>
  <Select.Trigger
    class={cn(
      block ? "w-full max-w-none" : "min-w-[12rem] max-w-[20rem]",
      "shadow-none",
      !isPlaceholder && "text-foreground data-placeholder:text-foreground",
      className,
    )}
    title={triggerLabel}
  >
    <span class={cn("truncate", isPlaceholder && "text-muted-foreground")}>{triggerLabel}</span>
  </Select.Trigger>
  <Select.Content class="max-h-60 p-1 shadow-none">
    {#each options as opt (opt.value)}
      <Select.Item
        value={opt.value}
        label={opt.label}
        disabled={opt.disabled}
        title={opt.hint || opt.label}
      >
        {opt.label}
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>

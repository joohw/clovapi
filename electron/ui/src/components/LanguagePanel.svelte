<script lang="ts">
  import SectionCard from "./SectionCard.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { i18n, setLocalePreference, t, type LocalePreference } from "../lib/i18n";

  const options: { value: Exclude<LocalePreference, "system">; label: string }[] = [
    { value: "zh", label: "ZH" },
    { value: "en", label: "EN" },
  ];

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("settings.language"),
      description: t("settings.languageDesc"),
      options,
    };
  });
</script>

<SectionCard title={copy.title} description={copy.description} embedded>
  {#snippet actions()}
    <div class="inline-flex">
      {#each copy.options as option (option.value)}
        <Button
          size="sm"
          variant="outline"
          class="relative -ml-px rounded-none first:ml-0 first:rounded-l-md last:rounded-r-md {(i18n.preference === option.value || (i18n.preference === 'system' && i18n.locale === option.value)) ? 'z-10 border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground' : ''}"
          onclick={() => setLocalePreference(option.value)}
        >
          {option.label}
        </Button>
      {/each}
    </div>
  {/snippet}
</SectionCard>

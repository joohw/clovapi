<script lang="ts">
  import SectionCard from "./SectionCard.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { i18n, setLocalePreference, t, type LocalePreference } from "../lib/i18n";

  const options: { value: LocalePreference; labelKey: string }[] = [
    { value: "system", labelKey: "settings.languageSystem" },
    { value: "zh", labelKey: "settings.languageZh" },
    { value: "en", labelKey: "settings.languageEn" },
  ];

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("settings.language"),
      description: t("settings.languageDesc"),
      options: options.map((option) => ({ ...option, label: t(option.labelKey) })),
    };
  });
</script>

<SectionCard title={copy.title} description={copy.description}>
  <div class="flex flex-wrap gap-2 px-4 py-4">
    {#each copy.options as option (option.value)}
      <Button
        size="sm"
        variant={i18n.preference === option.value ? "default" : "outline"}
        onclick={() => setLocalePreference(option.value)}
      >
        {option.label}
      </Button>
    {/each}
  </div>
</SectionCard>

<script lang="ts">
  import { i18n, t } from "../lib/i18n";
  import LanguagePanel from "./LanguagePanel.svelte";
  import ProxyAddressPanel from "./ProxyAddressPanel.svelte";
  import ProxyPanel from "./ProxyPanel.svelte";
  import SectionCard from "./SectionCard.svelte";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("tabs.settings"),
      description: t("settings.description"),
    };
  });
</script>

<SectionCard title={copy.title} description={copy.description} fill>
  <LanguagePanel />
  <ProxyAddressPanel />
  <ProxyPanel />
</SectionCard>

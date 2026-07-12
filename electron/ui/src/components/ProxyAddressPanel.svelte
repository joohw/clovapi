<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { i18n, t } from "../lib/i18n";
  import { saveLocalProxyAddress, store } from "../lib/store.svelte";
  import SectionCard from "./SectionCard.svelte";

  const copy = $derived.by(() => {
    void i18n.locale;
    return {
      title: t("proxy.localAddress"),
      description: t("proxy.localAddressDesc"),
      saveAddress: t("proxy.saveAddress"),
    };
  });

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    void saveLocalProxyAddress();
  }
</script>

<SectionCard title={copy.title} description={copy.description} embedded>
  <form class="flex items-center gap-2 px-4 py-3" onsubmit={onSubmit}>
    <Label for="proxy-local-address" class="sr-only">{copy.title}</Label>
    <Input
      id="proxy-local-address"
      class="flex-1"
      bind:value={store.proxyAddressDraft}
      placeholder="http://127.0.0.1:27483"
    />
    <Button type="submit" size="sm" disabled={store.running}>{copy.saveAddress}</Button>
  </form>
</SectionCard>

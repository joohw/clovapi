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

<SectionCard title={copy.title} description={copy.description}>
  <form class="px-4 py-3" onsubmit={onSubmit}>
    <div class="grid gap-2">
      <Label for="proxy-local-address">{copy.title}</Label>
      <div class="flex gap-2">
        <Input
          id="proxy-local-address"
          bind:value={store.proxyAddressDraft}
          placeholder="http://127.0.0.1:27483"
        />
        <Button type="submit" size="sm" disabled={store.running}>{copy.saveAddress}</Button>
      </div>
    </div>
  </form>
</SectionCard>

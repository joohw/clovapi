<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { sortedClisForDisplay } from "../lib/helpers";
import {
  activeBindingForCli,
  buildCliBindingOptions,
  cliApplyTitle,
  onCliBindingChange,
  runCliApply,
  store,
} from "../lib/store.svelte";
  import type { CliDef } from "../global";
  import CliIcon from "./CliIcon.svelte";
  import ListRow from "./ListRow.svelte";
  import SectionCard from "./SectionCard.svelte";
  import Select from "./Select.svelte";

  const clis = $derived(sortedClisForDisplay(store.clis, store.cliDetectedPath));

  function bindingOptions(cli: CliDef) {
    return buildCliBindingOptions(cli, store.profiles, store.subscriptions);
  }

  function rowLines(cli: CliDef, installed: boolean): string[] {
    return [installed ? `已安装: ${store.cliDetectedPath[cli.id]}` : "当前未安装"];
  }

  const cliDescription =
    "选择模型并应用后，CLI 的 base URL 会写入本地代理地址（/{providerId}/{modelId}/{apiStyle}/v1）；代理按路径转发，不依赖 active 绑定。";
</script>

<SectionCard title="已安装的 CLI" description={cliDescription}>
  {#each clis as cli (cli.id)}
    {@const installed = Boolean(store.cliDetectedPath[cli.id])}
    {@const activeBinding = activeBindingForCli(cli.kind)}
    <ListRow title={cli.name} lines={rowLines(cli, installed)} linesNowrap muted={!installed}>
      {#snippet leading()}
        <CliIcon kind={cli.kind} />
      {/snippet}
      {#snippet actions()}
        {#key `${cli.id}:${activeBinding}`}
          <Select
            options={bindingOptions(cli)}
            value={activeBinding}
            disabled={!installed || store.running}
            onchange={(v) => void onCliBindingChange(cli, v)}
          />
        {/key}
        <Button
          size="sm"
          disabled={!installed || store.running || !store.clovapiAvailable || !activeBinding}
          title={cliApplyTitle(cli)}
          onclick={() => void runCliApply(cli)}
        >
          应用
        </Button>
      {/snippet}
    </ListRow>
  {/each}
</SectionCard>

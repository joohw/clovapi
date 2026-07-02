import { t } from "../i18n";
import { toast } from "../toast";
import { store } from "./state.svelte";

export async function refreshModelList(options: { silent?: boolean } = {}) {
  const bridge = window.clovapiCli;
  if (!bridge?.profilesModels) {
    if (!options.silent) toast.error(t("toast.modelListLoadFailed"));
    return;
  }

  store.modelListLoading = true;
  try {
    const result = await bridge.profilesModels();
    if (!result?.ok) {
      if (!options.silent) toast.error(result?.error || t("toast.modelListLoadFailed"));
      return;
    }
    store.modelList = Array.isArray(result.models) ? result.models : [];
  } catch (error) {
    if (!options.silent) {
      toast.error(error instanceof Error ? error.message : t("toast.modelListLoadFailed"));
    }
  } finally {
    store.modelListLoading = false;
  }
}

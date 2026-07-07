import presetTemplate from "../../../../preset/api-presets.template.json";
import { CUSTOM_PRESET_ID, DEFAULT_PRESETS } from "../constants";
import { normalizePreset } from "../helpers";
import { store } from "./state.svelte";
import type { Preset } from "../../global";

export async function loadPresets() {
  try {
    const data = presetTemplate as { presets?: Partial<Preset>[] };
    if (!Array.isArray(data?.presets)) throw new Error("invalid preset schema");
    const presets = data.presets.map(normalizePreset).filter((item) => item.id);
    const hasCustom = presets.some((item) => item.id === CUSTOM_PRESET_ID);
    store.presets = hasCustom ? presets : [DEFAULT_PRESETS[0], ...presets];
  } catch {
    store.presets = [...DEFAULT_PRESETS];
  }
  store.presetId = CUSTOM_PRESET_ID;
}

export function applyPresetToForm(presetId: string) {
  const preset = store.presets.find((item) => item.id === presetId);
  if (!preset) return;
  store.formName = preset.apiName || "";
  store.formBaseUrl = preset.baseUrl || "";
  store.formModelAdapter = preset.modelAdapter || "openai-compatible";
}

export function applyPresetToModelForm(presetId: string) {
  const preset = store.presets.find((item) => item.id === presetId);
  if (!preset) return;
  store.formModelName = preset.defaultModel || "";
  store.formModelLabel = preset.defaultModel || "";
  store.formModelBaseUrl = preset.baseUrl || "";
  store.formModelApiStyle = preset.apiStyle || "responses";
}

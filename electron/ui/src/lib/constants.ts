export const TEST_STATUS_STORAGE_KEY = "clovapi-test-status-v1";
export const MODEL_TEST_STORAGE_KEY = "clovapi-model-tests-v2";
/** 模型连通性测试结果默认有效时长（3 小时） */
export const MODEL_TEST_VALIDITY_MS = 3 * 60 * 60 * 1000;
export const CUSTOM_PRESET_ID = "custom";

export const DEFAULT_PRESETS = [
  {
    id: CUSTOM_PRESET_ID,
    apiName: "custom",
    baseUrl: "",
    apiStyle: "responses",
    defaultModel: "",
  },
];

export const API_STYLES = ["chat", "responses", "message", "gemini"] as const;
export const SUBSCRIPTION_VENDOR_DEFS = [
  {
    subscriptionProviderId: "claude-code",
    name: "Claude Subscription",
    modelApiStyle: "message" as const,
  },
  {
    subscriptionProviderId: "codex",
    name: "Codex Subscription",
    modelApiStyle: "responses" as const,
  },
] as const;

export const SUBSCRIPTION_IDS = SUBSCRIPTION_VENDOR_DEFS.map((item) => item.subscriptionProviderId);
export const MODEL_BINDING_PREFIX = "@model:";
export const INTERNAL_PROFILE_PREFIX = "__";

export const MODEL_ADAPTER_IDS = ["manual", "openai-compatible", "ollama", "subscription"] as const;

export const CUSTOM_API_PROFILE_NAME = "Custom API";

export const OLLAMA_PROFILE_NAME = "Ollama";

/** 固定四种供应商 ID（与代理路径 /{providerId}/… 一致），禁止动态注册。 */
export const FIXED_PROVIDER_IDS = ["claude-code", "codex", "ollama", "custom"] as const;
export type FixedProviderId = (typeof FIXED_PROVIDER_IDS)[number];

export const OLLAMA_DEFAULTS = {
  baseUrl: "http://127.0.0.1:11434/v1",
  apiStyle: "chat",
  apiKey: "ollama",
} as const;

/** True when the desktop shell runs with `ELECTRON_DEV=1` (npm run dev). */
export function isElectronDev(): boolean {
  return Boolean(window.clovapiEnv?.isDev);
}

/** True when the UI runs inside the Electron renderer (not a plain browser tab). */
export function isElectronRenderer(): boolean {
  return typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
}

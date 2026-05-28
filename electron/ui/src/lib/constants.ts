export const TEST_STATUS_STORAGE_KEY = "clovapi-test-status-v1";
export const MODEL_TEST_STORAGE_KEY = "clovapi-model-tests-v2";
/** 模型连通性测试结果默认有效时长（3 小时） */
export const MODEL_TEST_VALIDITY_MS = 3 * 60 * 60 * 1000;
export const CUSTOM_PRESET_ID = "custom";

export const DEFAULT_CLIS = [
  { id: "cli-claude", name: "ClaudeCli", command: "claude", kind: "claude-code" },
  { id: "cli-codex", name: "CodexCli", command: "codex", kind: "codex" },
  { id: "cli-opencode", name: "OpenCodeCli", command: "opencode", kind: "opencode" },
  { id: "cli-openclaw", name: "OpenClaw", command: "openclaw", kind: "openclaw" },
  { id: "cli-hermes", name: "Hermes", command: "hermes", kind: "hermes" },
  { id: "cli-kimi-code", name: "KimiCodeCli", command: "kimi", kind: "kimi-code" },
] as const;

export const DEFAULT_PRESETS = [
  {
    id: CUSTOM_PRESET_ID,
    apiName: "custom",
    baseUrl: "",
    apiStyle: "openai-responses",
    defaultModel: "",
  },
];

export const API_STYLES = ["claude", "openai-chat", "openai-responses", "gemini"] as const;
export const SUBSCRIPTION_VENDOR_DEFS = [
  {
    subscriptionProviderId: "claude-code",
    name: "Claude Subscription",
    modelApiStyle: "claude" as const,
  },
  {
    subscriptionProviderId: "codex",
    name: "Codex Subscription",
    modelApiStyle: "openai-responses" as const,
  },
] as const;

export const SUBSCRIPTION_IDS = SUBSCRIPTION_VENDOR_DEFS.map((item) => item.subscriptionProviderId);
export const MODEL_BINDING_PREFIX = "@model:";
export const INTERNAL_PROFILE_PREFIX = "__";

export const MODEL_ADAPTER_IDS = ["manual", "openai-compatible", "ollama", "subscription"] as const;

export const CUSTOM_API_PROFILE_NAME = "Custom API";

export const OLLAMA_PROFILE_NAME = "Ollama";

/** 固定四种供应商 ID（与代理路径 /{providerId}/… 一致），禁止动态注册。 */
export const FIXED_PROVIDER_IDS = ["claude-code", "codex", "ollama", "custom-api"] as const;
export type FixedProviderId = (typeof FIXED_PROVIDER_IDS)[number];

export const OLLAMA_DEFAULTS = {
  baseUrl: "http://127.0.0.1:11434/v1",
  apiStyle: "openai-chat",
  apiKey: "ollama",
} as const;

/** True when the desktop shell runs with `ELECTRON_DEV=1` (npm run dev). */
export function isElectronDev(): boolean {
  return Boolean(window.clovapiEnv?.isDev);
}

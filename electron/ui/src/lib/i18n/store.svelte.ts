import en from "./locales/en";
import zh from "./locales/zh";
import {
  CUSTOM_API_PROFILE_NAME,
  OLLAMA_PROFILE_NAME,
  SUBSCRIPTION_VENDOR_DEFS,
} from "../constants";

export const LOCALE_STORAGE_KEY = "clovapi-locale";

export type LocalePreference = "system" | "zh" | "en";
export type ResolvedLocale = "zh" | "en";

const messages = { en, zh } as const;

export const i18n = $state({
  preference: "system" as LocalePreference,
  locale: "en" as ResolvedLocale,
});

function getPath(obj: Record<string, unknown>, key: string): unknown {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function resolveLocale(preference: LocalePreference): ResolvedLocale {
  if (preference === "zh") return "zh";
  if (preference === "en") return "en";
  const lang =
    typeof navigator !== "undefined" ? String(navigator.language || "").toLowerCase() : "en";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

export function readLocalePreference(): LocalePreference {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh" || saved === "en" || saved === "system") return saved;
  } catch {
    /* ignore */
  }
  return "system";
}

export function initI18n() {
  const preference = readLocalePreference();
  i18n.preference = preference;
  i18n.locale = resolveLocale(preference);
}

export function setLocalePreference(preference: LocalePreference) {
  i18n.preference = preference;
  i18n.locale = resolveLocale(preference);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  const raw = getPath(messages[i18n.locale] as unknown as Record<string, unknown>, key);
  let text = typeof raw === "string" ? raw : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function localeTag(): string {
  return i18n.locale === "zh" ? "zh-CN" : "en-US";
}

export function formatDateTime(value: string | number | Date | undefined | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(localeTag());
}

const VENDOR_DISPLAY_KEYS: Record<string, string> = {
  [SUBSCRIPTION_VENDOR_DEFS[0].name.toLowerCase()]: "vendor.claudeSubscription",
  [SUBSCRIPTION_VENDOR_DEFS[1].name.toLowerCase()]: "vendor.codexSubscription",
  [CUSTOM_API_PROFILE_NAME.toLowerCase()]: "vendor.customApi",
  [OLLAMA_PROFILE_NAME.toLowerCase()]: "vendor.ollama",
};

/** Map persisted English vendor names to localized UI labels. */
export function displayVendorName(storedName: string): string {
  const key = VENDOR_DISPLAY_KEYS[String(storedName || "").trim().toLowerCase()];
  return key ? t(key) : String(storedName || "").trim();
}

export function formatSubscriptionSummary(summary: string): string {
  const value = String(summary || "").trim();
  if (!value || value === "Not logged in") return t("subscription.notLoggedIn");
  if (value === "CLI not installed") return t("subscription.cliNotInstalled");
  if (value === "Logged in") return t("subscription.loggedIn");
  if (value.startsWith("Logged in · ")) {
    return t("subscription.loggedInWith", { detail: value.slice("Logged in · ".length) });
  }
  return value;
}

export function adapterMessageKey(adapterId: string): { label: string; description: string } {
  switch (adapterId) {
    case "manual":
      return { label: "adapter.manual.label", description: "adapter.manual.description" };
    case "openai-compatible":
      return {
        label: "adapter.openaiCompatible.label",
        description: "adapter.openaiCompatible.description",
      };
    case "ollama":
      return { label: "adapter.ollama.label", description: "adapter.ollama.description" };
    case "subscription":
      return {
        label: "adapter.subscription.label",
        description: "adapter.subscription.description",
      };
    default:
      return { label: "", description: "" };
  }
}

export { en, zh };

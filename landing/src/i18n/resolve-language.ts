import type { AppLanguage } from "@/i18n/config";

export function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("en")) return "en";
  return null;
}

import type { SubscriptionItem, Vendor, VendorUsageData, VendorUsageResult } from "../../global";
import { getSubscriptionVendors, shouldShowVendorUsage } from "../helpers";
import { t } from "../i18n";
import { toast } from "../toast";
import { store } from "./state.svelte";

export function vendorUsageSummary(vendorName: string): string {
  return store.vendorUsage[vendorName]?.summary || "";
}

export function vendorUsageSummaryForVendor(vendor: Vendor, subscriptions: SubscriptionItem[]): string {
  if (!shouldShowVendorUsage(vendor, subscriptions)) return "";
  return vendorUsageSummary(vendor.name);
}

export function clearVendorUsage(vendorName: string): void {
  const name = String(vendorName || "").trim();
  if (!name) return;
  delete store.vendorUsage[name];
  delete store.vendorUsageLoading[name];
}

export function pruneVendorUsageForSubscriptions(subscriptions: SubscriptionItem[]): void {
  for (const vendor of getSubscriptionVendors(store.profiles)) {
    if (!shouldShowVendorUsage(vendor, subscriptions)) {
      clearVendorUsage(vendor.name);
    }
  }
}

export function isVendorUsageLoading(vendorName: string): boolean {
  return Boolean(store.vendorUsageLoading[vendorName]);
}

function formatUsageRow(row: VendorUsageData): string {
  const name = usagePlanName(row.planName);
  const unit = String(row.unit || "").trim();
  if (row.used != null && row.total != null) {
    if (unit === "%") {
      const percent = row.total > 0 ? (row.used / row.total) * 100 : row.used;
      return name ? `${name} ${formatUsageNumber(percent)}%` : `${formatUsageNumber(percent)}%`;
    }
    if (row.remaining != null) {
      return name ? `${name} ${formatUsageNumber(row.remaining)} ${unit}` : `${formatUsageNumber(row.remaining)} ${unit}`;
    }
    return name
      ? `${name} ${formatUsageNumber(row.used)}/${formatUsageNumber(row.total)} ${unit}`
      : `${formatUsageNumber(row.used)}/${formatUsageNumber(row.total)} ${unit}`;
  }
  if (row.remaining != null) {
    const suffix = unit ? ` ${unit}` : "";
    return name ? `${name} ${formatUsageNumber(row.remaining)}${suffix}` : `${formatUsageNumber(row.remaining)}${suffix}`;
  }
  return row.invalidMessage || name || "—";
}

function usagePlanName(value: string | undefined): string {
  const name = String(value || "").trim();
  if (name === "five_hour") return t("vendorDetail.usageTierFiveHour");
  if (name === "weekly_limit") return t("vendorDetail.usageTierWeekly");
  if (name === "seven_day") return t("vendorDetail.usageTierSevenDay");
  if (name === "seven_day_opus") return t("vendorDetail.usageTierSevenDayOpus");
  if (name === "seven_day_sonnet") return t("vendorDetail.usageTierSevenDaySonnet");
  return name;
}

function formatUsageNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value - Math.round(value)) < 0.000001) return String(Math.round(value));
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function rowsFromTiers(result: NonNullable<VendorUsageResult["usage"]>): VendorUsageData[] {
  const tiers = Array.isArray(result.tiers) ? result.tiers : [];
  return tiers.map((tier) => {
    const used = Number(tier.utilization) || 0;
    return {
      planName: tier.name,
      used,
      total: 100,
      remaining: Math.max(0, 100 - used),
      unit: "%",
      extra: tier.resetsAt || "",
      isValid: true,
    };
  });
}

function vendorHasUsageCredentials(vendor: Vendor): boolean {
  if (vendor.baseUrl && vendor.apiKey) return true;
  return Boolean(vendor.models?.some((model) => model.baseUrl && model.apiKey));
}

export async function queryVendorUsage(vendor: Vendor, options: { silent?: boolean } = {}) {
  const name = String(vendor?.name || "").trim();
  if (!name) return;
  if (vendor.kind === "local") return;
  if (vendor.kind === "subscription" && !shouldShowVendorUsage(vendor, store.subscriptions)) {
    clearVendorUsage(name);
    return;
  }
  if (vendor.kind === "api" && !vendorHasUsageCredentials(vendor)) return;
  const bridge = window.clovapiCli;
  if (!bridge?.profilesUsage) {
    if (!options.silent) toast.error(t("toast.vendorUsageUnsupported"));
    return;
  }
  if (isVendorUsageLoading(name)) return;

  store.vendorUsageLoading[name] = true;
  try {
    const result = await bridge.profilesUsage(name);
    if (!result?.ok || !result.usage?.success) {
      const message = result?.error || result?.usage?.error || t("toast.vendorUsageFailed");
      if (vendor.kind === "subscription") {
        clearVendorUsage(name);
        if (options.silent) return;
      } else if (options.silent) {
        return;
      }
      store.vendorUsage[name] = { summary: message, rows: [], error: message };
      if (!options.silent) toast.error(message);
      return;
    }
    const rows = Array.isArray(result.usage.data) && result.usage.data.length > 0
      ? result.usage.data
      : rowsFromTiers(result.usage);
    const text = String(result.text || "").trim();
    const summary = text || (rows.length > 0
      ? rows.map(formatUsageRow).join(" · ")
      : t("vendorDetail.usageEmpty"));
    store.vendorUsage[name] = { summary, rows, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.vendorUsageFailed");
    if (options.silent) return;
    store.vendorUsage[name] = { summary: message, rows: [], error: message };
    if (!options.silent) toast.error(message);
  } finally {
    delete store.vendorUsageLoading[name];
  }
}

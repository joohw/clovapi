import type { Vendor, VendorUsageData } from "../../global";
import { t } from "../i18n";
import { toast } from "../toast";
import { store } from "./state.svelte";

export function vendorUsageSummary(vendorName: string): string {
  return store.vendorUsage[vendorName]?.summary || "";
}

export function isVendorUsageLoading(vendorName: string): boolean {
  return Boolean(store.vendorUsageLoading[vendorName]);
}

function formatUsageRow(row: VendorUsageData): string {
  const name = String(row.planName || "").trim();
  const unit = String(row.unit || "").trim();
  const parts: string[] = [];
  if (row.remaining != null) {
    parts.push(`${row.remaining}${unit ? ` ${unit}` : ""}`);
  }
  if (row.used != null && row.total != null) {
    parts.push(`${row.used}/${row.total}${unit ? ` ${unit}` : ""}`);
  }
  if (row.invalidMessage) {
    parts.push(row.invalidMessage);
  }
  const body = parts.length > 0 ? parts.join(" · ") : "—";
  return name ? `${name}: ${body}` : body;
}

export async function queryVendorUsage(vendor: Vendor) {
  const name = String(vendor?.name || "").trim();
  if (!name || vendor.kind !== "api") return;
  const bridge = window.clovapiCli;
  if (!bridge?.profilesUsage) {
    toast.error(t("toast.vendorUsageUnsupported"));
    return;
  }
  if (isVendorUsageLoading(name)) return;

  store.vendorUsageLoading[name] = true;
  try {
    const result = await bridge.profilesUsage(name);
    if (!result?.ok || !result.usage?.success) {
      const message = result?.error || result?.usage?.error || t("toast.vendorUsageFailed");
      store.vendorUsage[name] = { summary: message, rows: [], error: message };
      toast.error(message);
      return;
    }
    const rows = Array.isArray(result.usage.data) ? result.usage.data : [];
    const summary =
      rows.length > 0
        ? rows.map(formatUsageRow).join(" · ")
        : t("vendorDetail.usageEmpty");
    store.vendorUsage[name] = { summary, rows, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.vendorUsageFailed");
    store.vendorUsage[name] = { summary: message, rows: [], error: message };
    toast.error(message);
  } finally {
    delete store.vendorUsageLoading[name];
  }
}

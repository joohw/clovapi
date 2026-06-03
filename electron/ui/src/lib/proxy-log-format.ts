import { t } from "./i18n";
import type { ProxyLogEntry, ProxySystemLogEntry } from "../global";

export function formatProxyLogTime(value: string): string {
  if (!value) return t("callLogs.inProgress");
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

/** Compact ingress path as /{providerId}/v1[/{endpoint}]. Legacy model/style segments are omitted. */
export function proxyLogIngressPath(url: string): string {
  let path = String(url || "").trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* keep raw url */
    }
  }
  try {
    path = decodeURI(path);
  } catch {
    /* keep encoded path */
  }

  const legacy = path.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/v1(\/.*)?$/);
  if (legacy) {
    return formatProxyIngressDisplayPath(legacy[1], legacy[4] || "");
  }

  const modern = path.match(/^\/([^/]+)\/v1(\/.*)?$/);
  if (modern) {
    return formatProxyIngressDisplayPath(modern[1], modern[2] || "");
  }

  return path;
}

function formatProxyIngressDisplayPath(providerSegment: string, suffix: string): string {
  const provider = String(providerSegment || "").trim();
  if (!provider) return "/";
  const endpoint = String(suffix || "")
    .split("/")
    .map((part) => part.trim())
    .find(Boolean);
  return endpoint ? `/${provider}/v1/${endpoint}` : `/${provider}/v1`;
}

export function proxyLogVendorName(entry: ProxyLogEntry): string {
  const path = proxyLogIngressPath(entry.request?.url || "");
  const [, vendor = ""] = path.match(/^\/([^/]+)/) || [];
  return vendor;
}

export function proxyLogInboundRequestLine(entry: ProxyLogEntry): string {
  const method = String(entry.request?.method || "GET").trim().toUpperCase();
  const url = String(entry.request?.url || "").trim() || "/";
  const proto = String(entry.request?.proto || "HTTP/1.1").trim() || "HTTP/1.1";
  return `${method} ${url} ${proto}`;
}

export function proxyLogUpstreamRequestLine(entry: ProxyLogEntry): string {
  const method = String(entry.upstream?.method || "POST").trim().toUpperCase();
  const url = String(entry.upstream?.url || "").trim();
  if (!url) return "";
  return `${method} ${url} HTTP/1.1`;
}

export function proxyLogOverviewText(entry: ProxyLogEntry): string {
  const status = entry.upstream?.status ? String(entry.upstream.status) : "(pending)";
  const session = String(entry.session || entry.sessionId || "").trim() || t("common.none");
  const usage = proxyLogTokenUsageText(entry);
  const rows = [
    `${t("callLogs.overviewResult")}: ${proxyLogResultText(entry)}`,
    `${t("callLogs.overviewSession")}: ${session}`,
    `${t("callLogs.overviewTokens")}: ${usage}`,
    `${t("callLogs.overviewTime")}: ${proxyLogTimeRangeText(entry)}`,
    `${t("callLogs.toolCalls")}: ${entry.toolCallCount || 0}`,
    `${t("callLogs.overviewInbound")}: ${proxyLogInboundRequestLine(entry)}`,
    `${t("callLogs.overviewUpstream")}: ${proxyLogUpstreamRequestLine(entry) || t("common.none")}`,
    `${t("callLogs.overviewStatus")}: HTTP ${status}`,
  ];
  if (entry.error) {
    rows.push(`${t("callLogs.proxyError")}: ${entry.error}`);
  }
  return rows.join("\n");
}

export function proxyLogInboundRequestText(entry: ProxyLogEntry): string {
  const headers = proxyLogHeaderText(entry.request?.headers || {});
  const body = proxyLogBodyText(entry.request?.body || "");
  return `${proxyLogInboundRequestLine(entry)}\n\n${headers}\n\n${body}`;
}

export function proxyLogCardTitle(entry: ProxyLogEntry): string {
  const path = proxyLogIngressPath(entry.request?.url || "");
  const status = entry.upstream?.status || 0;
  return status ? `${path} (${status})` : path;
}

export function proxyLogStatusClass(status: number): string {
  if (!status) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status >= 400) return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

export function proxyLogHeaderText(headers: Record<string, string>): string {
  const entries = Object.entries(headers || {});
  if (!entries.length) return t("common.none");
  return entries.map(([key, value]) => `${key}: ${value}`).join("\n");
}

export function proxyLogTokenUsageText(entry: ProxyLogEntry): string {
  const usage = normalizeTokenUsage(entry.tokenUsage);
  return tokenUsageText(usage, { totalFirst: true });
}

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
};

function normalizeTokenUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  const out: TokenUsage = {};
  assignNumber(out, "inputTokens", usage.inputTokens);
  assignNumber(out, "outputTokens", usage.outputTokens);
  assignNumber(out, "totalTokens", usage.totalTokens);
  assignNumber(out, "cacheReadTokens", usage.cacheReadTokens);
  assignNumber(out, "cacheCreationTokens", usage.cacheCreationTokens);
  assignNumber(out, "reasoningTokens", usage.reasoningTokens);
  return Object.keys(out).length ? out : null;
}

export function tokenUsageText(usage: TokenUsage | null | undefined, options: { totalFirst?: boolean } = {}): string {
  if (!usage) return t("common.none");
  const parts = [];
  if (options.totalFirst && usage.totalTokens != null) parts.push(`${t("callLogs.totalTokens")}${usage.totalTokens}`);
  if (usage.inputTokens != null) parts.push(`${t("callLogs.inputTokens")}${usage.inputTokens}`);
  if (usage.outputTokens != null) parts.push(`${t("callLogs.outputTokens")} ${usage.outputTokens}`);
  if (!options.totalFirst && usage.totalTokens != null) parts.push(`${t("callLogs.totalTokens")}${usage.totalTokens}`);
  if (usage.cacheReadTokens != null) {
    const pct = tokenUsagePercent(usage.cacheReadTokens, usage.inputTokens);
    parts.push(`${t("callLogs.cacheReadTokens")} ${usage.cacheReadTokens}${pct}`);
  }
  if (usage.cacheCreationTokens != null) {
    parts.push(`${t("callLogs.cacheCreationTokens")} ${usage.cacheCreationTokens}`);
  }
  if (usage.reasoningTokens != null) parts.push(`${t("callLogs.reasoningTokens")} ${usage.reasoningTokens}`);
  return parts.length ? parts.join(" · ") : t("common.none");
}

function proxyLogTimeRangeText(entry: ProxyLogEntry): string {
  const started = formatTimestamp(entry.startedAt);
  const duration = typeof entry.durationMs === "number" && entry.durationMs > 0 ? ` · ${entry.durationMs}ms` : "";
  return started ? `${started}${duration}` : t("common.none");
}

function formatTimestamp(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return raw;
  }
}

function tokenUsagePercent(value: number, total: number | undefined): string {
  const percent = tokenUsagePercentValue(value, total);
  return percent == null ? "" : ` (${percent}%)`;
}

function tokenUsagePercentValue(value: number | undefined, total: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((value / total) * 100);
}

export function tokenUsageCacheRatePercent(usage: TokenUsage | null | undefined): number | null {
  const input = usage?.inputTokens;
  const read = usage?.cacheReadTokens;
  const created = usage?.cacheCreationTokens;
  const hasCacheMetric = read != null || created != null;
  if (!hasCacheMetric || typeof input !== "number" || !Number.isFinite(input) || input <= 0) return null;
  const readTokens = positiveNumber(read);
  const denominator = shouldTreatCacheAsSeparateInput(usage) ? input + readTokens + positiveNumber(created) : input;
  if (denominator <= 0) return null;
  return Math.round((readTokens / denominator) * 100);
}

function shouldTreatCacheAsSeparateInput(usage: TokenUsage | null | undefined): boolean {
  const input = positiveNumber(usage?.inputTokens);
  const read = positiveNumber(usage?.cacheReadTokens);
  const created = positiveNumber(usage?.cacheCreationTokens);
  return created > 0 || read > input;
}

function positiveNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function assignNumber(target: TokenUsage, key: keyof TokenUsage, value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (target[key] == null || value > Number(target[key])) {
    target[key] = value;
  }
}

export function proxyLogBodyText(body: string): string {
  const text = String(body || "");
  if (!text) return t("common.empty");
  return text;
}

export function proxyLogSummary(entry: ProxyLogEntry): string {
  const usage = normalizeTokenUsage(entry.tokenUsage);
  return tokenUsageSummaryText(usage);
}

export function tokenUsageSummaryText(usage: TokenUsage | null | undefined): string {
  const parts = [];
  if (usage?.inputTokens != null) parts.push(`${t("callLogs.inputTokens")}${usage.inputTokens}`);
  if (usage?.outputTokens != null) parts.push(`${t("callLogs.outputTokens")} ${usage.outputTokens}`);
  const cachePercent = tokenUsageCacheRatePercent(usage);
  if (cachePercent != null) parts.push(t("callLogs.cachePercent", { percent: cachePercent }));
  return parts.join(" · ");
}

function proxyLogResultText(entry: ProxyLogEntry): string {
  const status = entry.upstream.status ? String(entry.upstream.status) : "pending";
  if (!entry.completedAt) return `${status} · ${t("callLogs.inProgress")}`;
  return status;
}

export function proxySystemLogStreamClass(stream: string): string {
  const s = String(stream || "").toLowerCase();
  if (s === "stderr") return "text-red-600 dark:text-red-400";
  if (s === "stdout") return "text-muted-foreground";
  return "text-amber-600 dark:text-amber-400";
}

export function proxySystemLogStreamLabel(stream: string): string {
  const s = String(stream || "").toLowerCase();
  if (s === "stderr") return "ERR";
  if (s === "stdout") return "OUT";
  return "SYS";
}

export function proxySystemLogTitle(entry: ProxySystemLogEntry): string {
  const text = String(entry.message || "").replace(/\s+/g, " ").trim();
  if (!text) return t("common.empty");
  return text;
}

export function proxySystemLogSummary(entry: ProxySystemLogEntry): string {
  return `${proxySystemLogStreamLabel(entry.stream)} · ${formatProxyLogTime(entry.at)}`;
}

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

/** Compact ingress path by stripping the /v1/... endpoint suffix. */
export function proxyLogIngressPath(url: string): string {
  let path = String(url || "").trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* keep raw url */
    }
  }
  const match = path.match(/^(\/[^/]+\/[^/]+\/[^/]+)(?:\/v1(?:\/.*)?)?$/);
  if (match) return match[1];
  const v1Index = path.indexOf("/v1");
  if (v1Index > 0) return path.slice(0, v1Index);
  return path;
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
  const usage = proxyLogTokenUsageText(entry.upstream?.body || "");
  const rows = [
    `${t("callLogs.overviewResult")}: ${proxyLogSummary(entry)}`,
    `${t("callLogs.overviewSession")}: ${session}`,
    `${t("callLogs.overviewTokens")}: ${usage}`,
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
  const method = String(entry.request?.method || "GET").trim().toUpperCase();
  return `${method} ${proxyLogIngressPath(entry.request?.url || "")}`;
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

export function proxyLogTokenUsageText(body: string): string {
  const usage = extractProxyLogTokenUsage(body);
  if (!usage) return t("common.none");
  const parts = [];
  if (usage.inputTokens != null) parts.push(`${t("callLogs.inputTokens")}: ${usage.inputTokens}`);
  if (usage.outputTokens != null) parts.push(`${t("callLogs.outputTokens")}: ${usage.outputTokens}`);
  if (usage.cacheReadTokens != null) parts.push(`${t("callLogs.cacheReadTokens")}: ${usage.cacheReadTokens}`);
  if (usage.cacheCreationTokens != null) {
    parts.push(`${t("callLogs.cacheCreationTokens")}: ${usage.cacheCreationTokens}`);
  }
  return parts.length ? parts.join(" · ") : t("common.none");
}

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

function extractProxyLogTokenUsage(body: string): TokenUsage | null {
  const text = String(body || "").trim();
  if (!text) return null;
  const usage: TokenUsage = {};
  for (const payload of usagePayloadsFromBody(text)) {
    if (!payload || typeof payload !== "object") continue;
    const record = payload as Record<string, unknown>;
    mergeUsage(usage, record.usage);
    const message = record.message;
    if (message && typeof message === "object") {
      mergeUsage(usage, (message as Record<string, unknown>).usage);
    }
  }
  return Object.keys(usage).length ? usage : null;
}

function usagePayloadsFromBody(text: string): unknown[] {
  const payloads: unknown[] = [];
  if (text.startsWith("{")) {
    try {
      payloads.push(JSON.parse(text));
    } catch {
      /* ignore malformed body */
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^data:\s*(.+)$/);
    if (!match || match[1] === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(match[1]));
    } catch {
      /* ignore non-JSON SSE payloads */
    }
  }
  return payloads;
}

function mergeUsage(target: TokenUsage, raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const usage = raw as Record<string, unknown>;
  assignNumber(target, "inputTokens", usage.input_tokens);
  assignNumber(target, "outputTokens", usage.output_tokens);
  assignNumber(target, "cacheReadTokens", usage.cache_read_input_tokens);
  assignNumber(target, "cacheCreationTokens", usage.cache_creation_input_tokens);
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
  const status = entry.upstream.status ? String(entry.upstream.status) : "pending";
  const duration = entry.completedAt ? `${entry.durationMs}ms` : t("callLogs.inProgress");
  return `${entry.request.method} ${status} · ${duration}`;
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

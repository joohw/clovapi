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

/** Compact ingress path: /{provider}/{model}/{apiStyle} — strips /v1/... suffix. */
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
  const inboundHeaders = proxyLogHeaderText(entry.request?.headers || {});
  const upstreamHeaders = proxyLogHeaderText(entry.upstream?.headers || {});
  const status = entry.upstream?.status ? String(entry.upstream.status) : "(pending)";
  return [
    t("callLogs.inboundSection"),
    proxyLogInboundRequestLine(entry),
    "",
    inboundHeaders,
    "",
    t("callLogs.upstreamSection"),
    `HTTP ${status}`,
    proxyLogUpstreamRequestLine(entry),
    "",
    upstreamHeaders,
  ].join("\n");
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

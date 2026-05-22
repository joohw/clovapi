import type { ProxyLogEntry } from "../global";

export function formatProxyLogTime(value: string): string {
  if (!value) return "进行中";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

export function proxyLogStatusClass(status: number): string {
  if (!status) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status >= 400) return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

export function proxyLogHeaderText(headers: Record<string, string>): string {
  const entries = Object.entries(headers || {});
  if (!entries.length) return "(无)";
  return entries.map(([key, value]) => `${key}: ${value}`).join("\n");
}

export function proxyLogBodyText(body: string): string {
  const text = String(body || "");
  if (!text) return "(空)";
  return text;
}

export function proxyLogSummary(entry: ProxyLogEntry): string {
  const status = entry.upstream.status ? String(entry.upstream.status) : "pending";
  const duration = entry.completedAt ? `${entry.durationMs}ms` : "进行中";
  return `${entry.request.method} ${status} · ${duration}`;
}

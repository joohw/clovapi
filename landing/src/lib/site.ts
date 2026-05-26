export const SITE_NAME = "clovapi";

export const SITE_TAGLINE = "内置本地代理 · 轻松管理 Agent API";

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function getPublicSiteUrlFromRequest(host?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (!host) return "http://localhost:3000";
  return host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `https://${host}`;
}

/** @deprecated Use getHomeTitle from @/lib/seo for localized titles. */
export const HOME_TITLE = "内置本地代理 · Agent CLI API 切换 · clovapi";

/** @deprecated Use buildPageMetadata from @/lib/seo. */
export const DEFAULT_DESCRIPTION =
  "开源 CLI 与桌面客户端，以内置本地代理为核心：switch 后 Agent 统一走 localhost，由代理完成上游路由与 API 形态转码。add 保存 profile，switch 一键应用。";

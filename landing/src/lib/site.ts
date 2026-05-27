export const SITE_NAME = "clovapi";

export const SITE_TAGLINE = "内置本地代理 · 轻松管理 Agent API";

export const PUBLIC_SITE_URL = "https://clovapi.com";

export const GITHUB_REPO_URL = "https://github.com/joohw/clovapi";

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function isLocalHost(host: string): boolean {
  const bare = host.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  return bare === "localhost" || bare === "127.0.0.1";
}

export function resolveClientPublicSiteUrl(clientOrigin = ""): string {
  const origin = clientOrigin.trim().replace(/\/+$/, "");
  if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    return origin;
  }
  return PUBLIC_SITE_URL.replace(/\/+$/, "");
}

export function getPublicSiteUrlFromRequest(host?: string): string {
  if (!host) return "http://localhost:3000";
  if (host.startsWith("http://") || host.startsWith("https://")) {
    const url = host.replace(/\/+$/, "");
    return isLocalHost(url) ? url : PUBLIC_SITE_URL;
  }
  if (isLocalHost(host)) {
    return host.includes(":") ? `http://${host}` : "http://localhost:3000";
  }
  return PUBLIC_SITE_URL;
}

/** @deprecated Use getHomeTitle from @/lib/seo for localized titles. */
export const HOME_TITLE = "内置本地代理 · Agent CLI API 切换 · clovapi";

/** @deprecated Use buildPageMetadata from @/lib/seo. */
export const DEFAULT_DESCRIPTION =
  "开源 CLI 与桌面客户端，以内置本地代理为核心：switch 后 Agent 统一走 localhost，由代理完成上游路由与 API 形态转码。add 保存 profile，switch 一键应用。";

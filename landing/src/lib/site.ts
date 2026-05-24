export const SITE_NAME = "clovapi";

export const SITE_TAGLINE = "轻松管理 Agent API";

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function getPublicSiteUrlFromRequest(host?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (!host) return "http://localhost:27483";
  return host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `https://${host}`;
}

/** @deprecated Use getHomeTitle from @/lib/seo for localized titles. */
export const HOME_TITLE = "Claude Code / Codex API 一键切换 · CLOVAPI";

/** @deprecated Use buildPageMetadata from @/lib/seo. */
export const DEFAULT_DESCRIPTION =
  "开源 CLI 与桌面客户端：统一管理 Claude Code、Codex、OpenCode 等编程 Agent 的上游 API。支持官方订阅与第三方接口，clovapi add 保存、switch 一键写入配置。";

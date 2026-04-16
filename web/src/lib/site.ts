export const SITE_NAME = "CLOVAPI";
export const DEFAULT_DESCRIPTION =
  "CLOVAPI 是高性能的 AI 模型聚合网关，提供统一 API 接入、模型中转、计费与管理控制台。";
export const HOME_TITLE = "为Agent设计的高性能API网关";

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function getPublicSiteUrlFromRequest(host?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (!host) return "http://localhost:3001";
  return host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `https://${host}`;
}

export function titleByPath(pathname: string): string {
  if (pathname === "/") return HOME_TITLE;
  if (pathname.startsWith("/models")) return `模型广场 - ${SITE_NAME}`;
  if (pathname.startsWith("/docs")) return `文档中心 - ${SITE_NAME}`;
  if (pathname.startsWith("/dashboard")) return `用户控制台 - ${SITE_NAME}`;
  if (pathname.startsWith("/admin")) return `管理后台 - ${SITE_NAME}`;
  if (pathname.startsWith("/login")) return `登录 - ${SITE_NAME}`;
  if (pathname.startsWith("/register")) return `注册 - ${SITE_NAME}`;
  return SITE_NAME;
}

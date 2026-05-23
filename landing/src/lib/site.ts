export const SITE_NAME = "clovapi";

export const SITE_TAGLINE = "轻松管理 Agent API";
export const DEFAULT_DESCRIPTION =
  "clovapi 是开源 CLI，轻松管理 Agent API：支持 Claude Code、Codex 官方订阅与第三方上游，add 保存、switch 一键切换。";
export const HOME_TITLE = `${SITE_TAGLINE} · ${SITE_NAME.toUpperCase()}`;

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

export function titleByPath(pathname: string): string {
  if (pathname === "/") return HOME_TITLE;
  if (pathname.startsWith("/skill")) return `Agent Skill - ${SITE_NAME}`;
  return SITE_NAME;
}

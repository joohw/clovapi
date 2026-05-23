export const SITE_NAME = "CLOVAPI";

/** 首页标题轮播展示的 CLI / Agent 客户端名称（动态标题与首屏共用） */
export const HOME_CLI_CLIENTS = ["Claude Code", "Codex", "OpenCode"] as const;

export const SITE_TAGLINE = "为 Agent 切换高性能上游 · 本地 URL 直连第三方";
export const DEFAULT_DESCRIPTION =
  "面向 Claude Code、Codex CLI、OpenCode 等桌面与终端 Agent：保留兼容 OpenAI API 的本地入口，在后端把请求切换到任意第三方上游（类似 API Switcher），按需路由模型与通道——而不是锁死单一静态端点。";
/** 静态站点标题（SEO / 初始 SSR）；首页会通过脚本按 HOME_CLI_CLIENTS 轮换 document.title */
export const HOME_TITLE = `将 CLI 客户端切换为任意上游 · ${SITE_NAME}`;

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
  if (pathname.startsWith("/models")) return `模型与路由 - ${SITE_NAME}`;
  if (pathname.startsWith("/docs")) return `接入文档 - ${SITE_NAME}`;
  if (pathname.startsWith("/skill")) return `Agent Skill - ${SITE_NAME}`;
  return SITE_NAME;
}

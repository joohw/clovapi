export const SITE_NAME = "clovapi";
export const SITE_TAGLINE = "Local API proxy for model providers";
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

export const HOME_TITLE = "Local API proxy for model providers · clovapi";
export const DEFAULT_DESCRIPTION =
  "clovapi stores provider profiles, runs a local HTTP proxy, routes requests by provider, and transcodes OpenAI, Anthropic, and Gemini-compatible API formats.";

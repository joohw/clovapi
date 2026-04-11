import { env } from '$env/dynamic/public';

/**
 * 站点对外根 URL（无末尾 `/`）。
 * 优先 `PUBLIC_SITE_URL`（适合反代/多域名时固定 canonical）；未配置则用当前请求的 origin。
 *
 * @param {URL} url 如 `event.url` 或 `$page.url`
 * @returns {string}
 */
export function getPublicSiteUrl(url) {
  const raw = env.PUBLIC_SITE_URL;
  const fromEnv = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  return fromEnv || url.origin;
}

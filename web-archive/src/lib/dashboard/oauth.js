import { apiGet } from '$lib/api';
import { showError } from './notify.js';

function redirectToOAuthUrl(url, options = {}) {
  const { openInNewTab = false } = options;
  const targetUrl = typeof url === 'string' ? url : url.toString();
  if (openInNewTab) {
    window.open(targetUrl, '_blank');
    return;
  }
  window.location.assign(targetUrl);
}

export async function getOAuthState() {
  let path = '/api/oauth/state';
  const affCode = localStorage.getItem('aff');
  if (affCode && affCode.length > 0) {
    path += `?aff=${encodeURIComponent(affCode)}`;
  }
  const res = await apiGet(path);
  if (res?.success) {
    return res.data;
  }
  showError(res?.message || '获取 OAuth 状态失败');
  return '';
}

/**
 * @param {{ shouldLogout?: boolean }} [options]
 */
export async function prepareOAuthState(options = {}) {
  const { shouldLogout = false } = options;
  if (shouldLogout) {
    try {
      await apiGet('/api/user/logout');
    } catch (_) {}
    localStorage.removeItem('user');
  }
  return await getOAuthState();
}

/**
 * @param {string} github_client_id
 * @param {object} [options]
 */
export async function onGitHubOAuthClicked(github_client_id, options = {}) {
  const state = await prepareOAuthState(options);
  if (!state) return;
  redirectToOAuthUrl(
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(github_client_id)}&state=${encodeURIComponent(state)}&scope=user:email`,
  );
}

/**
 * @param {string} client_id
 * @param {object} [options]
 */
export async function onDiscordOAuthClicked(client_id, options = {}) {
  const state = await prepareOAuthState(options);
  if (!state) return;
  const redirect_uri = `${window.location.origin}/oauth/discord`;
  redirectToOAuthUrl(
    `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=identify+openid&state=${encodeURIComponent(state)}`,
  );
}

/**
 * @param {string} auth_url
 * @param {string} client_id
 * @param {boolean} [openInNewTab]
 * @param {object} [options]
 */
export async function onOIDCClicked(auth_url, client_id, openInNewTab = false, options = {}) {
  const state = await prepareOAuthState(options);
  if (!state) return;
  const url = new URL(auth_url);
  url.searchParams.set('client_id', client_id);
  url.searchParams.set('redirect_uri', `${window.location.origin}/oauth/oidc`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  redirectToOAuthUrl(url, { openInNewTab });
}

/**
 * @param {string} linuxdo_client_id
 * @param {object} [options]
 */
export async function onLinuxDOOAuthClicked(linuxdo_client_id, options = {}) {
  const state = await prepareOAuthState(options);
  if (!state) return;
  redirectToOAuthUrl(
    `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(linuxdo_client_id)}&state=${encodeURIComponent(state)}`,
  );
}

/**
 * @param {any} provider
 * @param {object} [options]
 */
export async function onCustomOAuthClicked(provider, options = {}) {
  const state = await prepareOAuthState(options);
  if (!state) return;
  try {
    const redirect_uri = `${window.location.origin}/oauth/${provider.slug}`;
    let authUrl;
    if (
      provider.authorization_endpoint.startsWith('http://') ||
      provider.authorization_endpoint.startsWith('https://')
    ) {
      authUrl = new URL(provider.authorization_endpoint);
    } else {
      showError('OAuth 配置错误：授权端点必须是完整的 URL（以 http:// 或 https:// 开头）');
      return;
    }
    authUrl.searchParams.set('client_id', provider.client_id);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', provider.scopes || 'openid profile email');
    authUrl.searchParams.set('state', state);
    redirectToOAuthUrl(authUrl);
  } catch (error) {
    console.error('Failed to initiate custom OAuth:', error);
    showError('OAuth 登录失败：' + (error?.message || '未知错误'));
  }
}

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env.VITE_REACT_APP_SERVER_URL) || '';

const AUTH_EXPIRED_HINTS = ['未登录', 'access token', 'Unauthorized', 'unauthorized'];

function getUserIdFromLocalStorage() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '-1';
    const user = JSON.parse(raw);
    return String(user?.id ?? -1);
  } catch (_) {
    return '-1';
  }
}

function baseHeaders() {
  return {
    'Cache-Control': 'no-store',
    'New-Api-User': getUserIdFromLocalStorage()
  };
}

/**
 * @param {Response} res
 * @param {any} payload
 */
function handleAuthExpired(res, payload) {
  if (typeof window === 'undefined') return;
  const hasSession = !!localStorage.getItem('user');
  if (!hasSession) return;

  const message = String(payload?.message || '');
  const unauthorizedByStatus = res?.status === 401;
  const unauthorizedByMessage = AUTH_EXPIRED_HINTS.some((hint) => message.includes(hint));
  if (!unauthorizedByStatus && !unauthorizedByMessage) return;

  localStorage.removeItem('user');

  const currentPath = window.location.pathname;
  if (currentPath !== '/login' && currentPath !== '/register' && currentPath !== '/reset') {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?redirect=${redirect}`);
  }
}

/**
 * @param {string} path
 */
function buildUrl(path) {
  if (!path.startsWith('/')) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

/** Absolute URL for manual fetch (e.g. streaming). */
export function apiUrl(path) {
  return buildUrl(path);
}

/**
 * @param {string} path
 */
export async function apiGet(path) {
  const res = await fetch(buildUrl(path), {
    method: 'GET',
    headers: baseHeaders()
  });
  const payload = await res.json();
  handleAuthExpired(res, payload);
  return payload;
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} [body]
 */
export async function apiPost(path, body) {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {})
  });
  const payload = await res.json();
  handleAuthExpired(res, payload);
  return payload;
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} [body]
 */
export async function apiPut(path, body) {
  const res = await fetch(buildUrl(path), {
    method: 'PUT',
    headers: {
      ...baseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {})
  });
  const payload = await res.json();
  handleAuthExpired(res, payload);
  return payload;
}

/**
 * @param {string} path
 */
export async function apiDelete(path) {
  const res = await fetch(buildUrl(path), {
    method: 'DELETE',
    headers: baseHeaders()
  });
  const payload = await res.json();
  handleAuthExpired(res, payload);
  return payload;
}

export { getUserIdFromLocalStorage };

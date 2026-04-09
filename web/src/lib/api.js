const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env.VITE_REACT_APP_SERVER_URL) || '';

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
  return res.json();
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
  return res.json();
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
  return res.json();
}

/**
 * @param {string} path
 */
export async function apiDelete(path) {
  const res = await fetch(buildUrl(path), {
    method: 'DELETE',
    headers: baseHeaders()
  });
  return res.json();
}

export { getUserIdFromLocalStorage };

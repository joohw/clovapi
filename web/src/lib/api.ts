const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL?.trim().replace(/\/+$/, "") || "";

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") return normalizedPath;
  if (!API_BASE) return normalizedPath;
  return `${API_BASE}${normalizedPath}`;
}

function shouldRetryWithRelative(path: string): boolean {
  return typeof window !== "undefined" && API_BASE.length > 0 && path.startsWith("/");
}

function baseHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "New-Api-User": "-1",
  };
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return { success: false, message: `HTTP ${response.status}` };
  }
}

export function apiUrl(path: string): string {
  return buildUrl(path);
}

async function requestJson(path: string, init: RequestInit) {
  const request = async (url: string) =>
    fetch(url, {
      ...init,
      cache: "no-store",
    });

  const primaryUrl = buildUrl(path);
  try {
    const response = await request(primaryUrl);
    const payload = await parseJsonResponse(response);
    return payload;
  } catch (error) {
    if (shouldRetryWithRelative(path)) {
      try {
        const fallbackResponse = await request(path);
        const fallbackPayload = await parseJsonResponse(fallbackResponse);
        return fallbackPayload;
      } catch {
        // ignore and return original fetch failure
      }
    }
    const message = error instanceof Error ? error.message : "未知网络错误";
    return { success: false, message: `网络请求失败：${message}` };
  }
}

export async function apiGet(path: string, init?: Pick<RequestInit, "signal">) {
  return requestJson(path, {
    method: "GET",
    headers: baseHeaders(),
    ...init,
  });
}

export async function apiPost(path: string, body?: Record<string, unknown>, init?: Pick<RequestInit, "signal">) {
  return requestJson(path, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    ...init,
  });
}

export async function apiPut(path: string, body?: Record<string, unknown>) {
  return requestJson(path, {
    method: "PUT",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiDelete(path: string) {
  return requestJson(path, {
    method: "DELETE",
    headers: baseHeaders(),
  });
}

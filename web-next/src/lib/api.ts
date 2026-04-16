import { clearStoredUser, getUserId } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL?.trim().replace(/\/+$/, "") || "";
const AUTH_EXPIRED_HINTS = ["未登录", "Unauthorized", "unauthorized"];

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
    "New-Api-User": getUserId(),
  };
}

function handleAuthExpired(response: Response, payload: any) {
  if (typeof window === "undefined") return;
  const hasSession = !!localStorage.getItem("user");
  if (!hasSession) return;
  const message = String(payload?.message || "");
  const unauthorizedByStatus = response.status === 401;
  const unauthorizedByMessage = AUTH_EXPIRED_HINTS.some((hint) =>
    message.includes(hint),
  );
  if (!unauthorizedByStatus && !unauthorizedByMessage) return;
  clearStoredUser();
  const currentPath = window.location.pathname;
  if (!["/login", "/register", "/reset"].includes(currentPath)) {
    const redirect = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.assign(`/login?redirect=${redirect}`);
  }
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
    handleAuthExpired(response, payload);
    return payload;
  } catch (error) {
    if (shouldRetryWithRelative(path)) {
      try {
        const fallbackResponse = await request(path);
        const fallbackPayload = await parseJsonResponse(fallbackResponse);
        handleAuthExpired(fallbackResponse, fallbackPayload);
        return fallbackPayload;
      } catch {
        // ignore and return original fetch failure
      }
    }
    const message = error instanceof Error ? error.message : "未知网络错误";
    return { success: false, message: `网络请求失败：${message}` };
  }
}

export async function apiGet(path: string) {
  return requestJson(path, {
    method: "GET",
    headers: baseHeaders(),
  });
}

export async function apiPost(path: string, body?: Record<string, unknown>) {
  return requestJson(path, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
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

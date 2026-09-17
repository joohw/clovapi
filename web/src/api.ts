import type { ManagementAPI } from "./types";

export type Info = { ok?: boolean; version?: string; isDev?: boolean; ollamaInstalled?: boolean; error?: string };

async function request<T>(endpoint: string, payload: unknown = {}): Promise<T> {
  try {
    const response = await fetch(`/api/admin/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Clovapi-Admin": "1" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok && !result.error) result.error = `HTTP ${response.status}`;
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Management service unavailable" } as T;
  }
}

type LoginStatus = { ok?: boolean; id?: string; done?: boolean; authorizeUrl?: string; result?: { ok?: boolean; error?: string }; error?: string };
const cancelledProviders = new Set<string>();

async function login(payload: string | { provider: string; credentialRef?: string }) {
  const input = typeof payload === "string" ? { provider: payload } : payload;
  cancelledProviders.delete(input.provider);
  // Open during the click gesture; keep a visible link if popups are blocked.
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  let prompt: HTMLDialogElement | undefined;
  let opened = false;
  try {
    const started = await request<LoginStatus>("auth/login", input);
    if (!started.ok || !started.id) return { ok: false, error: started.error };
    const deadline = Date.now() + 190_000;
    while (Date.now() < deadline) {
      if (cancelledProviders.has(input.provider)) return { ok: false, cancelled: true };
      const status = await request<LoginStatus>("auth/poll", { id: started.id });
      if (!status.ok) return { ok: false, error: status.error };
      if (status.authorizeUrl && !opened) {
        opened = true;
        if (popup && !popup.closed) popup.location.replace(status.authorizeUrl);
        else {
          prompt = document.createElement("dialog");
          prompt.className = "oauth-browser-dialog";
          const link = document.createElement("a");
          link.textContent = "Open sign-in page / 打开登录页面";
          link.href = status.authorizeUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const close = document.createElement("button");
          close.textContent = "Cancel / 取消";
          close.onclick = () => { void cancelLogin(input.provider); prompt?.close(); };
          prompt.addEventListener("cancel", () => { void cancelLogin(input.provider); });
          prompt.append(link, close);
          document.body.append(prompt);
          prompt.showModal();
        }
      }
      if (status.done) return status.result || { ok: false, error: "Login ended without a result" };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await request("auth/cancel", { provider: input.provider });
    return { ok: false, error: "Login timed out" };
  } finally {
    prompt?.remove();
    if (popup && !popup.closed) popup.close();
  }
}

async function cancelLogin(provider: string): Promise<{ ok?: boolean; error?: string }> {
  cancelledProviders.add(provider);
  return request("auth/cancel", { provider });
}

export async function initializeAPI() {
  const info = await request<Info>("info");
  if (!info.ok) throw new Error(info.error || "Cannot connect to the local management service");
  const api: ManagementAPI = {
    profilesLoad: () => request("profiles/load"),
    profilesSave: (payload) => request("profiles/save", payload),
    profilesModels: () => request("profiles/models"),
    profilesCatalog: () => request("profiles/catalog"),
    profilesListModels: (vendor, credentialRef = "") => request("profiles/list-models", { vendor, credentialRef }),
    profilesUsage: (vendor, credentialRef = "") => request("profiles/usage", { vendor, credentialRef }),
    profilesTest: (payload) => {
      if (typeof payload === "string") return Promise.resolve({ ok: false, error: "Provider and model required" });
      return request("profiles/test", { provider: payload.provider || payload.provider_id, model: payload.model || payload.model_id, port: payload.proxy?.port });
    },
    proxyStatus: () => request("proxy/status"),
    proxyHealth: () => request("proxy/health"),
    proxyStart: (port, host) => request("proxy/start", { port, host }),
    proxyStop: () => request("proxy/stop"),
    proxyConfigSave: (payload) => request("proxy/config", payload),
    proxyLogsList: (payload = {}) => request("logs/list", payload),
    proxyLogsClear: (scope = "all") => request("logs/clear", { scope }),
    authStatus: () => request("auth/status"),
    authLogin: login,
    cancelAuthLogin: cancelLogin,
    authLogout: (provider) => request("auth/logout", { provider }),
    which: async (command) => ({ ok: true, exists: command === "ollama" && Boolean(info.ollamaInstalled) }),
  };
  return { api, info };
}

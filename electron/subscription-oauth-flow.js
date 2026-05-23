const { shell } = require("electron");
const { loginClaudeOAuth, CALLBACK_PORT: CLAUDE_PORT } = require("./oauth/claude");
const { loginCodexOAuth, CALLBACK_PORT: CODEX_PORT } = require("./oauth/codex");
const { isCallbackPortAvailable, waitWithTimeout, loginCancelledError } = require("./oauth/utils");
const subscriptionAuth = require("./subscription-auth");

/**
 * ClovAPI desktop subscription OAuth (Claude Code + Codex).
 * In-process PKCE + localhost callback — no pi-ai dependency.
 */

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

const OAUTH_CALLBACK_PORTS = {
  "claude-code": CLAUDE_PORT,
  codex: CODEX_PORT,
};

function portInUseMessage(providerId, port) {
  const label = providerId === "codex" ? "Codex" : "Claude";
  return (
    `本地 OAuth 回调端口 ${port} 已被占用，${label} 登录无法启动。` +
    `请关闭其他占用该端口的程序（如 ${label} CLI、其他登录窗口），或完成已在进行中的浏览器登录后重试。`
  );
}

async function ensureCallbackPortFree(providerId) {
  const port = OAUTH_CALLBACK_PORTS[providerId];
  if (!port) return { ok: true };
  const check = await isCallbackPortAvailable(port);
  if (check.ok) return { ok: true };
  return { ok: false, error: portInUseMessage(providerId, port) };
}

function openOAuthUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    void shell.openExternal(parsed.toString()).catch(() => {});
  } catch {
    // ignore malformed URLs
  }
}

function formatListenError(err, providerId) {
  if (err && err.code === "EADDRINUSE") {
    const port = OAUTH_CALLBACK_PORTS[providerId];
    return portInUseMessage(providerId, port);
  }
  return err instanceof Error ? err.message : String(err);
}

async function runSubscriptionLogin(providerId, options = {}) {
  const signal = options.signal;

  const portCheck = await ensureCallbackPortFree(providerId);
  if (!portCheck.ok) {
    return { ok: false, error: portCheck.error };
  }

  const oauthOptions = {
    signal,
    onAuthorizeUrl: (url) => openOAuthUrl(url),
  };

  try {
    if (providerId === "claude-code") {
      const creds = await waitWithTimeout(
        loginClaudeOAuth(oauthOptions),
        LOGIN_TIMEOUT_MS,
        signal,
      );
      subscriptionAuth.writeClaudeOAuthCredentials(creds);
      return { ok: true, loggedIn: true, refreshed: true };
    }

    if (providerId === "codex") {
      const creds = await waitWithTimeout(
        loginCodexOAuth({ ...oauthOptions, originator: "clovapi" }),
        LOGIN_TIMEOUT_MS,
        signal,
      );
      subscriptionAuth.writeCodexOAuthCredentials(creds);
      return { ok: true, loggedIn: true, refreshed: true };
    }

    return { ok: false, error: `未知订阅类型: ${providerId}` };
  } catch (error) {
    const cancelled = error?.code === "LOGIN_CANCELLED" || signal?.aborted;
    return {
      ok: false,
      cancelled,
      error: formatListenError(error, providerId) || "登录失败",
    };
  }
}

/** @deprecated Use runSubscriptionLogin */
const runPiSubscriptionLogin = runSubscriptionLogin;

module.exports = {
  LOGIN_TIMEOUT_MS,
  OAUTH_CALLBACK_PORTS,
  ensureCallbackPortFree,
  runSubscriptionLogin,
  runPiSubscriptionLogin,
  loginCancelledError,
};

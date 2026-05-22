const {
  generatePKCE,
  createOAuthState,
  startCallbackServer,
  decodeJwtPayload,
} = require("./utils");

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = "/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

function getAccountId(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[JWT_CLAIM_PATH];
  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

async function exchangeAuthorizationCode(code, verifier, signal) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
    signal: signal || AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Codex Token 交换失败 (${response.status}): ${text || response.statusText}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Codex Token 响应不是有效 JSON");
  }

  const access = String(json.access_token || "").trim();
  const refresh = String(json.refresh_token || "").trim();
  if (!access || !refresh || typeof json.expires_in !== "number") {
    throw new Error("Codex Token 响应缺少必要字段");
  }

  const accountId = getAccountId(access);
  if (!accountId) {
    throw new Error("无法从 access_token 解析 ChatGPT account_id");
  }

  return {
    access,
    refresh,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
  };
}

/**
 * OpenAI Codex / ChatGPT OAuth (PKCE + localhost:1455 callback).
 */
async function loginCodexOAuth(options = {}) {
  const signal = options.signal;
  const originator = options.originator || "clovapi";
  const { verifier, challenge } = await generatePKCE();
  const state = createOAuthState();

  const server = await startCallbackServer({
    port: CALLBACK_PORT,
    path: CALLBACK_PATH,
    signal,
    validate: (params) => {
      const error = params.get("error");
      if (error) {
        return {
          ok: false,
          status: 400,
          message: "OpenAI 授权未完成。",
          details: error,
        };
      }
      if (params.get("state") !== state) {
        return { ok: false, status: 400, message: "OAuth state 不匹配。" };
      }
      const code = params.get("code");
      if (!code) {
        return { ok: false, status: 400, message: "缺少 authorization code。" };
      }
      return { ok: true, data: { code } };
    },
  });

  try {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("id_token_add_organizations", "true");
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator", originator);

    if (typeof options.onAuthorizeUrl === "function") {
      options.onAuthorizeUrl(url.toString());
    }

    const callback = await server.waitForCallback();
    return await exchangeAuthorizationCode(callback.code, verifier, signal);
  } finally {
    server.close();
  }
}

module.exports = {
  CALLBACK_PORT,
  REDIRECT_URI,
  loginCodexOAuth,
};

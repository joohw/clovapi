const {
  generatePKCE,
  startCallbackServer,
} = require("./utils");

/** Same public OAuth client as Claude Code / pi-ai (PKCE, no secret). */
const CLIENT_ID = Buffer.from("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl", "base64").toString(
  "utf8",
);

const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const CALLBACK_PORT = 53692;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

async function postJson(url, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: signal || AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token 请求失败 (${response.status}): ${text || response.statusText}`);
  }
  return JSON.parse(text);
}

function pickClaudeMetadata(tokenData) {
  const meta = {};
  const subscriptionType =
    tokenData.subscription_type ||
    tokenData.subscriptionType ||
    tokenData.tier ||
    tokenData.plan;
  if (subscriptionType) meta.subscriptionType = String(subscriptionType);

  const rateLimitTier = tokenData.rate_limit_tier || tokenData.rateLimitTier;
  if (rateLimitTier) meta.rateLimitTier = String(rateLimitTier);

  const scopes = tokenData.scope || tokenData.scopes;
  if (scopes) {
    meta.scopes = Array.isArray(scopes) ? scopes : String(scopes).split(/\s+/).filter(Boolean);
  }
  return meta;
}

async function exchangeAuthorizationCode(code, state, verifier, redirectUri, signal) {
  const tokenData = await postJson(
    TOKEN_URL,
    {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    },
    signal,
  );

  const access = String(tokenData.access_token || "").trim();
  const refresh = String(tokenData.refresh_token || "").trim();
  if (!access || !refresh) {
    throw new Error("Token 响应缺少 access_token 或 refresh_token");
  }

  const expiresIn = Number(tokenData.expires_in || 0);
  const expires =
    expiresIn > 0 ? Date.now() + expiresIn * 1000 - 5 * 60 * 1000 : Date.now() + 3600 * 1000;

  const creds = {
    access,
    refresh,
    expires,
    ...pickClaudeMetadata(tokenData),
  };

  try {
    const profile = await fetchClaudeOAuthProfile(access, signal);
    Object.assign(creds, profileToSubscriptionMeta(profile));
  } catch {
    // Profile is optional for login success; tier can be refreshed on status poll.
  }

  return creds;
}

function formatOrganizationType(orgType) {
  const raw = String(orgType || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("max")) return "Max";
  if (raw.includes("pro")) return "Pro";
  if (raw.includes("team")) return "Team";
  if (raw.includes("enterprise")) return "Enterprise";
  if (raw.includes("free") || raw === "claude_ai") return "Free";
  return raw.replace(/^claude_/, "").replace(/_/g, " ");
}

/** Map /api/oauth/profile response to credential metadata (same source as Claude Code CLI). */
function profileToSubscriptionMeta(profile) {
  const account = profile?.account || {};
  const org = profile?.organization || {};
  const meta = {};

  if (account.has_claude_max) meta.subscriptionType = "Max";
  else if (account.has_claude_pro) meta.subscriptionType = "Pro";
  else if (org.organization_type) {
    meta.organizationType = String(org.organization_type);
    meta.subscriptionType = formatOrganizationType(org.organization_type);
  }

  const rateLimitTier = org.rate_limit_tier || org.rateLimitTier;
  if (rateLimitTier) meta.rateLimitTier = String(rateLimitTier);

  const email = account.email;
  if (email) meta.email = String(email);

  const displayName = account.display_name || account.full_name;
  if (displayName) meta.displayName = String(displayName);

  return meta;
}

async function fetchClaudeOAuthProfile(accessToken, signal) {
  const response = await fetch(PROFILE_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: signal || AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Profile 请求失败 (${response.status}): ${text || response.statusText}`);
  }
  return JSON.parse(text);
}

/**
 * Claude Code / Claude.ai OAuth (authorization code + PKCE + localhost callback).
 * @returns {Promise<{ access: string, refresh: string, expires: number, subscriptionType?: string, rateLimitTier?: string, scopes?: string[] }>}
 */
async function loginClaudeOAuth(options = {}) {
  const signal = options.signal;
  const { verifier, challenge } = await generatePKCE();

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
          message: "Claude 授权未完成。",
          details: error,
        };
      }
      const code = params.get("code");
      const state = params.get("state");
      if (!code || !state) {
        return { ok: false, status: 400, message: "缺少 code 或 state 参数。" };
      }
      if (state !== verifier) {
        return { ok: false, status: 400, message: "OAuth state 不匹配。" };
      }
      return { ok: true, data: { code, state } };
    },
  });

  try {
    const authParams = new URLSearchParams({
      code: "true",
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
    });
    const authorizeUrl = `${AUTHORIZE_URL}?${authParams.toString()}`;

    if (typeof options.onAuthorizeUrl === "function") {
      options.onAuthorizeUrl(authorizeUrl);
    }

    const callback = await server.waitForCallback();
    return await exchangeAuthorizationCode(
      callback.code,
      callback.state,
      verifier,
      REDIRECT_URI,
      signal,
    );
  } finally {
    server.close();
  }
}

module.exports = {
  CALLBACK_PORT,
  REDIRECT_URI,
  PROFILE_URL,
  loginClaudeOAuth,
  fetchClaudeOAuthProfile,
  profileToSubscriptionMeta,
  formatOrganizationType,
};

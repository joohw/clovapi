const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

/** Internal profiles.json row generated from Claude OAuth (not user-editable). */
const CLAUDE_SUB_PROFILE_NAME = "__claude_subscription__";
const CODEX_SUB_PROFILE_NAME = "__codex_subscription__";

const ANTHROPIC_OAUTH_BASE_URL = "https://api.anthropic.com";
const OPENAI_OAUTH_BASE_URL = "https://api.openai.com/v1";
const CODEX_BACKEND_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_CLAUDE_SUB_MODEL = "claude-sonnet-4-6";
const DEFAULT_CODEX_SUB_MODEL = "gpt-5.4";
const {
  fetchCodexBackendModels,
  isCodexSubscriptionModelId,
  CODEX_SUBSCRIPTION_MODEL_FALLBACKS,
} = require("./codex-backend");

const PROVIDERS = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code 订阅",
    command: "claude",
    loginArgs: ["auth", "login"],
    authPath() {
      return path.join(os.homedir(), ".claude", ".credentials.json");
    },
  },
  codex: {
    id: "codex",
    label: "Codex 订阅",
    command: "codex",
    authPath() {
      const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
      return path.join(codexHome, "auth.json");
    },
  },
};

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isClaudeCredentialsValid(data) {
  const oauth = data?.claudeAiOauth;
  const token = String(oauth?.accessToken || "").trim();
  if (!token) return false;
  const expiresAt = Number(oauth?.expiresAt || 0);
  if (expiresAt > 0 && Date.now() > expiresAt) return false;
  return true;
}

/** ChatGPT OAuth in auth.json (not API-key-only entries). */
function isCodexSubscriptionAuthValid(data) {
  if (!data || typeof data !== "object") return false;
  const tokens = data.tokens;
  if (!tokens || typeof tokens !== "object") return false;
  const access = String(tokens.access_token || tokens.accessToken || "").trim();
  return Boolean(access);
}

function formatClaudeSubscriptionLabel(oauth) {
  if (!oauth || typeof oauth !== "object") return "";
  if (oauth.subscriptionType) return String(oauth.subscriptionType);
  const { formatOrganizationType } = require("./oauth/claude");
  if (oauth.organizationType) return formatOrganizationType(oauth.organizationType);
  return "";
}

function summarizeStatus(providerId, loggedIn, data) {
  if (!loggedIn) return "未登录";
  if (providerId === "claude-code") {
    const label = formatClaudeSubscriptionLabel(data?.claudeAiOauth);
    return label ? `已登录 · ${label}` : "已登录";
  }
  if (providerId === "codex") {
    const mode = String(data?.auth_mode || "").trim();
    return mode ? `已登录 · ${mode}` : "已登录";
  }
  return "已登录";
}

function getProviderStatus(providerId, commandResolved) {
  const cfg = PROVIDERS[providerId];
  if (!cfg) {
    return { ok: false, error: `Unknown provider: ${providerId}` };
  }
  const authPath = cfg.authPath();
  const installed = Boolean(commandResolved?.exists);
  let loggedIn = false;
  let summary = "未登录";
  if (installed && fs.existsSync(authPath)) {
    const data = readJsonFile(authPath);
    loggedIn =
      providerId === "claude-code" ? isClaudeCredentialsValid(data) : isCodexSubscriptionAuthValid(data);
    summary = summarizeStatus(providerId, loggedIn, data);
  } else if (!installed) {
    summary = "CLI 未安装";
  }

  return {
    ok: true,
    id: providerId,
    label: cfg.label,
    command: cfg.command,
    installed,
    commandPath: commandResolved?.path || "",
    loggedIn,
    summary,
  };
}

function listProviderIds() {
  return Object.keys(PROVIDERS);
}

function getProviderConfig(providerId) {
  return PROVIDERS[providerId] || null;
}

function checkAuthFile(providerId) {
  const cfg = PROVIDERS[providerId];
  if (!cfg) return false;
  const authPath = cfg.authPath();
  if (!fs.existsSync(authPath)) return false;
  const data = readJsonFile(authPath);
  return providerId === "claude-code" ? isClaudeCredentialsValid(data) : isCodexSubscriptionAuthValid(data);
}

/** Snapshot auth file before OAuth — login succeeds only when this changes and credentials are valid. */
function getAuthFingerprint(providerId) {
  const cfg = PROVIDERS[providerId];
  if (!cfg) return { exists: false, mtimeMs: 0, size: 0 };
  const authPath = cfg.authPath();
  try {
    if (!fs.existsSync(authPath)) return { exists: false, mtimeMs: 0, size: 0 };
    const st = fs.statSync(authPath);
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return { exists: false, mtimeMs: 0, size: 0 };
  }
}

function authFingerprintChanged(before, after) {
  const prev = before || { exists: false, mtimeMs: 0, size: 0 };
  const next = after || { exists: false, mtimeMs: 0, size: 0 };
  if (!prev.exists && next.exists) return true;
  if (!prev.exists || !next.exists) return false;
  return prev.mtimeMs !== next.mtimeMs || prev.size !== next.size;
}

function loginCompletedSince(beforeFingerprint, providerId) {
  if (!checkAuthFile(providerId)) return false;
  return authFingerprintChanged(beforeFingerprint, getAuthFingerprint(providerId));
}

function readClaudeCredentialsData() {
  const cfg = PROVIDERS["claude-code"];
  if (!cfg) return null;
  if (!fs.existsSync(cfg.authPath())) return null;
  return readJsonFile(cfg.authPath());
}

/** Token exchange omits tier; fetch profile API (same as Claude Code CLI) and persist. */
async function refreshClaudeSubscriptionMetadata() {
  const data = readClaudeCredentialsData();
  if (!isClaudeCredentialsValid(data)) return;
  const oauth = data.claudeAiOauth;
  if (oauth.subscriptionType) return;

  const { fetchClaudeOAuthProfile, profileToSubscriptionMeta } = require("./oauth/claude");
  try {
    const profile = await fetchClaudeOAuthProfile(oauth.accessToken);
    const meta = profileToSubscriptionMeta(profile);
    if (!meta.subscriptionType && !meta.organizationType) return;
    writeClaudeOAuthCredentials({
      access: oauth.accessToken,
      refresh: oauth.refreshToken,
      expires: oauth.expiresAt,
      scopes: oauth.scopes,
      ...meta,
    });
  } catch {
    // Non-fatal on status poll
  }
}

function readClaudeDefaultModel() {
  try {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    const settings = readJsonFile(settingsPath);
    const model = settings?.model;
    if (typeof model === "string" && model.trim()) return model.trim();
  } catch {}
  return DEFAULT_CLAUDE_SUB_MODEL;
}

/**
 * Build a relay profile from Claude Code OAuth credentials (for Kimi Code anthropic provider).
 */
function extractCodexAccessToken(data) {
  const tokens = data?.tokens;
  if (tokens && typeof tokens === "object") {
    return String(tokens.access_token || tokens.accessToken || "").trim();
  }
  return String(data?.api_key || data?.openai_api_key || "").trim();
}

function readCodexAccountId(data) {
  const stored = String(data?.tokens?.account_id || "").trim();
  if (stored) return stored;
  const token = extractCodexAccessToken(data);
  if (!token) return "";
  const { decodeJwtPayload } = require("./oauth/utils");
  const payload = decodeJwtPayload(token);
  const auth = payload?.["https://api.openai.com/auth"];
  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : "";
}

function isPlaceholderSubscriptionModel(modelEntry) {
  const id = String(modelEntry?.id || "").trim();
  const model = String(modelEntry?.model || "").trim();
  return !model || model === "default" || id === "default";
}

function resolveSubscriptionTestModel(providerId, modelEntry, builtProfile) {
  if (!isPlaceholderSubscriptionModel(modelEntry)) {
    return String(modelEntry?.model || modelEntry?.id || "").trim();
  }
  if (providerId === "claude-code") {
    return readClaudeDefaultModel();
  }
  return String(builtProfile?.model || "").trim();
}

function readCodexDefaultModel() {
  try {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const configPath = path.join(codexHome, "config.toml");
    const raw = fs.readFileSync(configPath, "utf8");
    const match = raw.match(/^\s*model\s*=\s*"([^"]+)"/m);
    if (match && match[1]) return match[1].trim();
  } catch {}
  return DEFAULT_CODEX_SUB_MODEL;
}

function buildCodexSubscriptionProfile(targetCli = "codex") {
  const data = readJsonFile(PROVIDERS.codex.authPath());
  if (!data) {
    return { ok: false, error: "未检测到 Codex 订阅凭据，请先在 API 管理登录 Codex 订阅。" };
  }
  if (!isCodexSubscriptionAuthValid(data)) {
    return { ok: false, error: "Codex 订阅凭据无效或已过期，请重新登录。" };
  }
  const token = extractCodexAccessToken(data);
  if (!token) {
    return { ok: false, error: "Codex 订阅凭据中缺少 access_token。" };
  }
  const accountId = readCodexAccountId(data);
  if (!accountId) {
    return { ok: false, error: "Codex 订阅凭据中缺少 chatgpt account_id，请重新登录。" };
  }
  return {
    ok: true,
    profile: {
      name: CODEX_SUB_PROFILE_NAME,
      cli: targetCli,
      api_style: "openai-responses",
      base_url: CODEX_BACKEND_BASE_URL,
      api_key: token,
      account_id: accountId,
      model: readCodexDefaultModel(),
    },
  };
}

function buildSubscriptionProfile(providerId, targetCli) {
  if (providerId === "claude-code") {
    return buildClaudeSubscriptionProfile(targetCli || "claude-code");
  }
  if (providerId === "codex") {
    return buildCodexSubscriptionProfile(targetCli || "codex");
  }
  return { ok: false, error: `未知订阅类型: ${providerId}` };
}

function buildClaudeSubscriptionProfile(targetCli = "claude-code") {
  const data = readClaudeCredentialsData();
  if (!data) {
    return { ok: false, error: "未检测到 Claude Code 订阅凭据，请先在 API 管理登录 Claude Code 订阅。" };
  }
  if (!isClaudeCredentialsValid(data)) {
    return { ok: false, error: "Claude Code 订阅凭据无效或已过期，请重新登录。" };
  }
  const token = String(data.claudeAiOauth?.accessToken || "").trim();
  return {
    ok: true,
    profile: {
      name: CLAUDE_SUB_PROFILE_NAME,
      cli: targetCli,
      api_style: "claude",
      base_url: ANTHROPIC_OAUTH_BASE_URL,
      api_key: token,
      model: readClaudeDefaultModel(),
    },
  };
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function writeClaudeOAuthCredentials(creds) {
  const authPath = PROVIDERS["claude-code"].authPath();
  ensureDirForFile(authPath);
  const existing = readJsonFile(authPath);
  const prev = existing?.claudeAiOauth && typeof existing.claudeAiOauth === "object" ? existing.claudeAiOauth : {};

  const oauth = {
    accessToken: creds.access,
    refreshToken: creds.refresh,
    expiresAt: creds.expires,
  };
  const subscriptionType = creds.subscriptionType || prev.subscriptionType;
  const rateLimitTier = creds.rateLimitTier || prev.rateLimitTier;
  const scopes = creds.scopes || prev.scopes;
  const organizationType = creds.organizationType || prev.organizationType;
  const email = creds.email || prev.email;
  const displayName = creds.displayName || prev.displayName;
  if (subscriptionType) oauth.subscriptionType = subscriptionType;
  if (rateLimitTier) oauth.rateLimitTier = rateLimitTier;
  if (scopes) oauth.scopes = scopes;
  if (organizationType) oauth.organizationType = organizationType;
  if (email) oauth.email = email;
  if (displayName) oauth.displayName = displayName;

  const payload = { claudeAiOauth: oauth };
  fs.writeFileSync(authPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function writeCodexOAuthCredentials(creds) {
  const authPath = PROVIDERS.codex.authPath();
  ensureDirForFile(authPath);
  const payload = {
    auth_mode: "chatgpt",
    tokens: {
      access_token: creds.access,
      refresh_token: creds.refresh,
      account_id: creds.accountId,
    },
    last_refresh: new Date().toISOString(),
  };
  fs.writeFileSync(authPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function removeAuthFile(providerId) {
  const cfg = PROVIDERS[providerId];
  if (!cfg) return { ok: false, error: "Unknown provider" };
  const authPath = cfg.authPath();
  try {
    if (fs.existsSync(authPath)) {
      fs.unlinkSync(authPath);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to remove auth file",
    };
  }
}

module.exports = {
  CLAUDE_SUB_PROFILE_NAME,
  CODEX_SUB_PROFILE_NAME,
  PROVIDERS,
  listProviderIds,
  getProviderConfig,
  getProviderStatus,
  refreshClaudeSubscriptionMetadata,
  formatClaudeSubscriptionLabel,
  checkAuthFile,
  getAuthFingerprint,
  authFingerprintChanged,
  loginCompletedSince,
  buildClaudeSubscriptionProfile,
  buildCodexSubscriptionProfile,
  buildSubscriptionProfile,
  resolveSubscriptionTestModel,
  readCodexDefaultModel,
  readCodexAccountId,
  writeClaudeOAuthCredentials,
  writeCodexOAuthCredentials,
  removeAuthFile,
};

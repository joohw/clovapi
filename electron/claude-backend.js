const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const ANTHROPIC_OAUTH_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_MODELS_URL = `${ANTHROPIC_OAUTH_BASE_URL}/v1/models`;
const CLAUDE_CODE_VERSION = "2.1.75";
const FETCH_TIMEOUT_MS = 20_000;
/** pi-ai OAuth 请求必须携带的 Claude Code system（见 packages/ai/src/providers/anthropic.ts） */
const CLAUDE_CODE_OAUTH_SYSTEM_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

const CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
];

let cachedAccountModels = null;
let cachedAccountModelsAt = 0;
const ACCOUNT_MODELS_TTL_MS = 5 * 60 * 1000;

function claudeCredentialsPath() {
  return path.join(os.homedir(), ".claude", ".credentials.json");
}

function readClaudeAuthFile() {
  try {
    const raw = fs.readFileSync(claudeCredentialsPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isClaudeOAuthToken(token) {
  return String(token || "").trim().includes("sk-ant-oat");
}

function buildClaudeOAuthProbePayload(model, userMessage = "ping") {
  const modelId =
    String(model || "").trim() || CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS[0];
  return {
    model: modelId,
    max_tokens: 16,
    stream: true,
    system: [{ type: "text", text: CLAUDE_CODE_OAUTH_SYSTEM_PROMPT }],
    messages: [{ role: "user", content: String(userMessage || "ping") }],
  };
}

function claudeStreamProbePassed(raw, status) {
  const text = String(raw || "");
  if (status >= 400) return false;
  if (/event:\s*error\b/i.test(text) || text.includes('"type":"error"')) {
    return false;
  }
  return (
    text.includes("message_stop") ||
    text.includes("content_block_delta") ||
    text.includes("message_start")
  );
}

function formatClaudeStreamError(status, raw) {
  const text = String(raw || "").trim();
  if (status >= 400) {
    return text ? `HTTP ${status}: ${text.slice(0, 400)}` : `HTTP ${status}`;
  }
  if (!text) return "SSE 流未返回任何事件";
  if (/event:\s*error\b/i.test(text)) return "SSE 流返回 error 事件";
  return "SSE 流未收到 message_start / content_block_delta / message_stop";
}

function probeClaudeOAuthMessagesStream(urlString, headers, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      reject(error);
      return;
    }

    const body = { ...payload, stream: true };
    const data = JSON.stringify(body);
    const lib = url.protocol === "https:" ? https : http;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        const status = res.statusCode || 0;

        const finalize = () => {
          const ok = claudeStreamProbePassed(raw, status);
          finish({
            ok,
            status,
            headers: res.headers,
            body: raw.slice(0, 8192),
            error: ok ? "" : formatClaudeStreamError(status, raw),
          });
        };

        if (status >= 400) {
          res.on("data", (chunk) => {
            raw += chunk.toString();
          });
          res.on("end", finalize);
          return;
        }

        res.on("data", (chunk) => {
          raw += chunk.toString();
          if (raw.includes("message_stop") || raw.includes("content_block_delta")) {
            req.destroy();
            finish({
              ok: true,
              status,
              headers: res.headers,
              body: raw.slice(0, 8192),
            });
          } else if (/event:\s*error\b/i.test(raw) || raw.includes('"type":"error"')) {
            req.destroy();
            finish({
              ok: false,
              status,
              headers: res.headers,
              body: raw.slice(0, 8192),
              error: formatClaudeStreamError(status, raw),
            });
          }
        });

        res.on("end", finalize);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 (${timeoutMs}ms)`));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function buildClaudeOAuthHeaders(accessToken) {
  const token = String(accessToken || "").trim();
  // 对齐 pi-ai Claude Code OAuth：Bearer + Claude Code beta/UA（非 x-api-key）
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
    "anthropic-dangerous-direct-browser-access": "true",
    "user-agent": `claude-cli/${CLAUDE_CODE_VERSION}`,
    "x-app": "cli",
  };
}

function httpGetJson(urlString, headers = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      reject(error);
      return;
    }

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${bodyText.slice(0, 400)}`));
            return;
          }
          try {
            resolve(JSON.parse(bodyText));
          } catch {
            reject(new Error(`响应不是 JSON: ${bodyText.slice(0, 200)}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 (${timeoutMs}ms)`));
    });
    req.on("error", reject);
    req.end();
  });
}

function parseClaudeModelsBody(body) {
  const list = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : [];

  const out = [];
  const seen = new Set();
  for (const item of list) {
    const modelId = String(item?.id || item?.model || "").trim();
    if (!modelId || seen.has(modelId.toLowerCase())) continue;
    seen.add(modelId.toLowerCase());
    const label =
      String(item?.display_name || item?.displayName || item?.name || modelId).trim() || modelId;
    out.push({
      id: modelId,
      label,
      model: modelId,
      isDefault: false,
    });
  }

  if (out.length) {
    const preferred =
      out.find((item) => /sonnet-4-6/i.test(item.id)) ||
      out.find((item) => /sonnet/i.test(item.id)) ||
      out[0];
    for (const item of out) {
      item.isDefault = item.id === preferred.id;
    }
  }

  return out;
}

function fallbackClaudeModels() {
  return CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS.map((modelId, index) => ({
    id: modelId,
    label: modelId,
    model: modelId,
    isDefault: index === 0,
  }));
}

function clearClaudeModelCache() {
  cachedAccountModels = null;
  cachedAccountModelsAt = 0;
}

function defaultClaudeModelFromCatalog(catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  const picked = list.find((item) => item?.isDefault) || list[0];
  return String(picked?.model || picked?.id || CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS[0]).trim();
}

function readClaudeAccessToken(credentials = {}) {
  let accessToken = String(credentials.accessToken || credentials.access_token || "").trim();
  if (!accessToken) {
    const data = readClaudeAuthFile();
    accessToken = String(data?.claudeAiOauth?.accessToken || "").trim();
  }
  return accessToken;
}

async function fetchClaudeOAuthModels(credentials = {}) {
  const accessToken = readClaudeAccessToken(credentials);
  if (!accessToken) {
    throw new Error("Claude 未登录：缺少 access_token，请先在 API 管理登录 Claude Code 订阅。");
  }

  try {
    const body = await httpGetJson(ANTHROPIC_MODELS_URL, buildClaudeOAuthHeaders(accessToken));
    const models = parseClaudeModelsBody(body);
    if (models.length) {
      cachedAccountModels = models;
      cachedAccountModelsAt = Date.now();
      return { models, source: ANTHROPIC_MODELS_URL };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`拉取 Claude 模型失败: ${message}`);
  }

  throw new Error("Claude 后端返回空模型列表");
}

async function loadClaudeAccountModels(options = {}) {
  const force = Boolean(options.force);
  if (
    !force &&
    cachedAccountModels &&
    Date.now() - cachedAccountModelsAt < ACCOUNT_MODELS_TTL_MS
  ) {
    return cachedAccountModels;
  }
  try {
    const result = await fetchClaudeOAuthModels(options.credentials || {});
    cachedAccountModels = result.models;
    cachedAccountModelsAt = Date.now();
    return cachedAccountModels;
  } catch {
    return fallbackClaudeModels();
  }
}

function isPlaceholderClaudeModel(modelEntry) {
  const id = String(modelEntry?.id || "").trim();
  const model = String(modelEntry?.model || "").trim();
  return !model || model === "default" || id === "default";
}

function isClaudeAccountUnsupportedModelError(body, status) {
  const text = String(body || "");
  if (Number(status) === 404) return true;
  return (
    text.includes("not_found_error") &&
    (text.includes('"model"') || text.includes("model:"))
  );
}

async function resolveClaudeSubscriptionTestModel(modelEntry) {
  const catalog = await loadClaudeAccountModels();
  const preferred = defaultClaudeModelFromCatalog(catalog);
  if (isPlaceholderClaudeModel(modelEntry)) {
    return preferred;
  }
  const want = String(modelEntry?.model || modelEntry?.id || "").trim();
  const allowed = new Set(
    catalog.map((item) => String(item?.model || item?.id || "").trim().toLowerCase()).filter(Boolean),
  );
  if (allowed.has(want.toLowerCase())) return want;
  return preferred;
}

async function resolveClaudeTestModels(requested) {
  const catalog = await loadClaudeAccountModels();
  const catalogIds = catalog
    .map((item) => String(item?.model || item?.id || "").trim())
    .filter(Boolean);
  const allowed = new Set(catalogIds.map((id) => id.toLowerCase()));
  const preferred = defaultClaudeModelFromCatalog(catalog);
  const want = String(requested || "").trim();
  const out = [];

  if (want && want !== "default" && allowed.has(want.toLowerCase())) {
    out.push(want);
  }
  if (preferred) out.push(preferred);
  for (const id of catalogIds) out.push(id);
  if (!allowed.size) {
    out.push(...CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS);
  }

  return [...new Set(out.filter(Boolean))];
}

module.exports = {
  ANTHROPIC_OAUTH_BASE_URL,
  ANTHROPIC_MODELS_URL,
  CLAUDE_CODE_VERSION,
  CLAUDE_CODE_OAUTH_SYSTEM_PROMPT,
  CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS,
  isClaudeOAuthToken,
  buildClaudeOAuthHeaders,
  buildClaudeOAuthProbePayload,
  probeClaudeOAuthMessagesStream,
  fetchClaudeOAuthModels,
  loadClaudeAccountModels,
  resolveClaudeTestModels,
  resolveClaudeSubscriptionTestModel,
  isClaudeAccountUnsupportedModelError,
  clearClaudeModelCache,
  fallbackClaudeModels,
  parseClaudeModelsBody,
};

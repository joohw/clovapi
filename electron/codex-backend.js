const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models";
const CODEX_CLIENT_VERSION = "0.105.0";
const FETCH_TIMEOUT_MS = 20_000;

function codexModelsListUrl() {
  return `${CODEX_MODELS_URL}?client_version=${encodeURIComponent(CODEX_CLIENT_VERSION)}`;
}

function isCodexSubscriptionModelId(modelId) {
  const id = String(modelId || "").trim().toLowerCase();
  if (!id || id === "default") return false;
  return true;
}

function buildCodexProbePayload(model) {
  return {
    model,
    instructions: "",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "ping" }],
      },
    ],
    stream: true,
    store: false,
  };
}

function codexStreamProbePassed(raw, status) {
  const text = String(raw || "");
  if (status >= 400) return false;
  if (text.includes("response.failed") || text.includes('"type":"error"')) return false;
  return text.includes("response.completed") || text.includes("response.created");
}

function probeCodexResponsesStream(urlString, headers, payload, timeoutMs) {
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
          const ok = codexStreamProbePassed(raw, status);
          finish({
            ok,
            status,
            headers: res.headers,
            body: raw.slice(0, 8192),
            error: ok ? "" : formatCodexStreamError(status, raw),
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
          if (raw.includes("response.completed")) {
            req.destroy();
            finish({
              ok: true,
              status,
              headers: res.headers,
              body: raw.slice(0, 8192),
            });
          } else if (raw.includes("response.failed") || raw.includes('"type":"error"')) {
            req.destroy();
            finish({
              ok: false,
              status,
              headers: res.headers,
              body: raw.slice(0, 8192),
              error: formatCodexStreamError(status, raw),
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

function formatCodexStreamError(status, raw) {
  if (status >= 400) {
    return formatHttpStatusError(status, raw);
  }
  const text = String(raw || "").trim();
  if (!text) return "SSE 流未返回任何事件";
  if (text.includes("response.failed")) return "SSE 流返回 response.failed";
  return "SSE 流未收到 response.completed";
}

function formatHttpStatusError(status, body) {
  const snippet = String(body || "").trim().slice(0, 400);
  return snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`;
}

function codexAuthPath() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "auth.json");
}

function readCodexAuthFile() {
  try {
    const raw = fs.readFileSync(codexAuthPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
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

function parseCodexModelsBody(body) {
  const list = Array.isArray(body?.models)
    ? body.models
    : Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.result?.data)
        ? body.result.data
        : Array.isArray(body)
          ? body
          : [];

  const out = [];
  const seen = new Set();
  for (const item of list) {
    const modelId = String(item?.slug || item?.id || item?.model || "").trim();
    if (!modelId || seen.has(modelId.toLowerCase())) {
      continue;
    }
    if (item?.hidden === true) {
      continue;
    }
    const visibility = String(item?.visibility || "list").trim().toLowerCase();
    if (visibility === "hide" || visibility === "hidden") {
      continue;
    }
    if (item?.supported_in_api === false) {
      continue;
    }
    seen.add(modelId.toLowerCase());
    const label =
      String(item?.display_name || item?.displayName || item?.name || modelId).trim() || modelId;
    out.push({
      id: modelId,
      label,
      model: modelId,
      isDefault: Boolean(item?.isDefault || item?.is_default),
      priority: Number(item?.priority || 0),
    });
  }

  out.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });

  return out;
}

function codexAuthHeaders(accessToken, accountId) {
  return {
    Authorization: `Bearer ${String(accessToken || "").trim()}`,
    "chatgpt-account-id": String(accountId || "").trim(),
    "OpenAI-Beta": "responses=experimental",
    Originator: "clovapi",
  };
}

async function fetchCodexBackendModels(credentials = {}) {
  let accessToken = String(credentials.accessToken || credentials.access_token || "").trim();
  let accountId = String(credentials.accountId || credentials.account_id || "").trim();

  if (!accessToken || !accountId) {
    const data = readCodexAuthFile();
    if (!accessToken) {
      const tokens = data?.tokens;
      accessToken = String(tokens?.access_token || tokens?.accessToken || data?.access_token || "").trim();
    }
    if (!accountId) {
      accountId = String(data?.tokens?.account_id || "").trim();
      if (!accountId && accessToken) {
        const payload = decodeJwtPayload(accessToken);
        const auth = payload?.["https://api.openai.com/auth"];
        accountId = typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : "";
      }
    }
  }

  if (!accessToken) {
    throw new Error("Codex 未登录：缺少 access_token，请先在 API 管理登录 Codex 订阅。");
  }
  if (!accountId) {
    throw new Error("Codex 未登录：缺少 chatgpt account_id，请重新登录。");
  }

  try {
    const body = await httpGetJson(codexModelsListUrl(), codexAuthHeaders(accessToken, accountId));
    const models = parseCodexModelsBody(body);
    if (models.length) {
      cachedAccountModels = models;
      cachedAccountModelsAt = Date.now();
      return { models, source: codexModelsListUrl() };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`拉取 Codex 模型失败: ${message}`);
  }

  throw new Error("Codex 后端返回空模型列表");
}

let cachedAccountModels = null;
let cachedAccountModelsAt = 0;
const ACCOUNT_MODELS_TTL_MS = 5 * 60 * 1000;

function clearCodexModelCache() {
  cachedAccountModels = null;
  cachedAccountModelsAt = 0;
}

function defaultCodexModelFromCatalog(catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  const picked = list.find((item) => item?.isDefault) || list[0];
	return String(picked?.model || picked?.id || "").trim();
}

async function loadCodexAccountModels(options = {}) {
  const force = Boolean(options.force);
  if (
    !force &&
    cachedAccountModels &&
    Date.now() - cachedAccountModelsAt < ACCOUNT_MODELS_TTL_MS
  ) {
    return cachedAccountModels;
  }
  try {
    const result = await fetchCodexBackendModels(options.credentials || {});
    cachedAccountModels = result.models;
    cachedAccountModelsAt = Date.now();
    return cachedAccountModels;
  } catch {
    return [];
  }
}

function isCodexAccountUnsupportedModelError(body) {
  return String(body || "").includes("not supported when using Codex with a ChatGPT account");
}

function isPlaceholderCodexModel(modelEntry) {
  const id = String(modelEntry?.id || "").trim();
  const model = String(modelEntry?.model || "").trim();
  return !model || model === "default" || id === "default";
}

async function resolveCodexSubscriptionTestModel(modelEntry) {
  const catalog = await loadCodexAccountModels();
  const preferred = defaultCodexModelFromCatalog(catalog);
  if (isPlaceholderCodexModel(modelEntry)) {
    return preferred;
  }
  const want = String(modelEntry?.model || modelEntry?.id || "").trim();
  const allowed = new Set(
    catalog.map((item) => String(item?.model || item?.id || "").trim().toLowerCase()).filter(Boolean),
  );
  if (allowed.has(want.toLowerCase())) return want;
  return preferred;
}

async function resolveCodexTestModels(requested) {
  const catalog = await loadCodexAccountModels();
  const catalogIds = catalog
    .map((item) => String(item?.model || item?.id || "").trim())
    .filter(Boolean);
  const allowed = new Set(catalogIds.map((id) => id.toLowerCase()));
  const preferred = defaultCodexModelFromCatalog(catalog);
  const want = String(requested || "").trim();
  const out = [];

  if (want && want !== "default" && allowed.has(want.toLowerCase())) {
    out.push(want);
  }
  if (preferred) out.push(preferred);
  for (const id of catalogIds) out.push(id);
  return [...new Set(out.filter(Boolean))];
}

module.exports = {
  CODEX_MODELS_URL,
  CODEX_CLIENT_VERSION,
  isCodexSubscriptionModelId,
  buildCodexProbePayload,
  probeCodexResponsesStream,
  codexModelsListUrl,
  fetchCodexBackendModels,
  loadCodexAccountModels,
  resolveCodexTestModels,
  resolveCodexSubscriptionTestModel,
  isCodexAccountUnsupportedModelError,
  clearCodexModelCache,
  parseCodexModelsBody,
};

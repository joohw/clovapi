/**
 * 按 api_style 分流的连通性测试（原生 HTTP，不依赖 pi-ai）。
 * 逻辑对齐 switcher/internal/testclient/testclient.go
 */

const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const {
  CLAUDE_SUB_PROFILE_NAME,
  CODEX_SUB_PROFILE_NAME,
} = require("./subscription-auth");
const {
  buildCodexProbePayload,
  probeCodexResponsesStream,
  resolveCodexTestModels,
  isCodexAccountUnsupportedModelError,
} = require("./codex-backend");
const {
  ANTHROPIC_OAUTH_BASE_URL,
  CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS,
  buildClaudeOAuthHeaders,
  buildClaudeOAuthProbePayload,
  probeClaudeOAuthMessagesStream,
  isClaudeOAuthToken,
  isClaudeAccountUnsupportedModelError,
} = require("./claude-backend");

const PROBE_MESSAGE = "ping";
const PROBE_MAX_TOKENS = 16;
const PROBE_TIMEOUT_MS = 45_000;
const PROBE_TIMEOUT_LOCAL_MS = 120_000;

/** @type {Record<string, { id: string; label: string }>} */
const TEST_PATHS = {
  claude: { id: "claude", label: "Claude Messages" },
  "openai-chat": { id: "openai-chat", label: "OpenAI Chat Completions" },
  "openai-responses": { id: "openai-responses", label: "OpenAI Responses" },
  "openai-codex-responses": { id: "openai-codex-responses", label: "OpenAI Codex Responses" },
  gemini: { id: "gemini", label: "Gemini (OpenAI-compat chat)" },
};

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function maskApiKey(key) {
  const s = String(key || "").trim();
  if (!s) return "(空)";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} 字符)`;
}

function safeJson(value, fallback = "") {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback || String(value);
  }
}

function joinV1Path(base, rest) {
  const b = normalizeBaseUrl(base);
  if (b.endsWith("/v1")) {
    return `${b}/${rest}`;
  }
  return `${b}/v1/${rest}`;
}

function resolveTestPathId(profile) {
  if (profile?.name === CODEX_SUB_PROFILE_NAME) return "openai-codex-responses";
  if (profile?.name === CLAUDE_SUB_PROFILE_NAME) return "claude";
  const style = String(profile?.api_style || "").trim().toLowerCase();
  if (style === "claude") return "claude";
  if (style === "openai-chat") return "openai-chat";
  if (style === "openai-responses") return "openai-responses";
  if (style === "gemini") return "gemini";
  return "";
}

function isLocalBaseUrl(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function probeTimeoutMs(profile, meta = {}) {
  if (meta.adapterId === "ollama" || isLocalBaseUrl(profile?.base_url)) {
    return PROBE_TIMEOUT_LOCAL_MS;
  }
  return PROBE_TIMEOUT_MS;
}

function buildValidationFailure(profile, message, meta = {}) {
  const pathId = resolveTestPathId(profile);
  const path = TEST_PATHS[pathId];
  const lines = [
    "=== 配置检查失败（未发起请求）===",
    "",
    `原因: ${message}`,
    "",
    "--- 当前 Profile 配置 ---",
    `名称: ${profile?.name || "(未知)"}`,
    `API 风格: ${profile?.api_style || "(未知)"}`,
    `测试路径: ${path?.label || pathId || "(未知)"}`,
    meta.adapterId ? `模型适配器: ${meta.adapterId}` : "",
    `Base URL: ${profile?.base_url || "(空)"}`,
    `Model: ${profile?.model || "(空)"}`,
    `API Key: ${maskApiKey(profile?.api_key)}`,
  ].filter(Boolean);
  return {
    ok: false,
    summary: "测试失败",
    text: lines.join("\n"),
    detail: {
      validationError: message,
      profile: {
        name: profile?.name,
        api_style: profile?.api_style,
        base_url: profile?.base_url,
        model: profile?.model,
      },
      testPath: pathId,
      adapterId: meta.adapterId,
      providerId: meta.providerId,
    },
  };
}

function httpPostJson(urlString, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      reject(error);
      return;
    }

    const payload = JSON.stringify(body);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8").slice(0, 8192);
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: bodyText,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 (${timeoutMs}ms)`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function passedStatus(status) {
  return status >= 200 && status < 300;
}

function formatHttpError(status, body) {
  const snippet = String(body || "").trim().slice(0, 400);
  return snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`;
}

async function probeOpenAiChat(base, apiKey, model, timeoutMs) {
  const url = joinV1Path(base, "chat/completions");
  const payload = {
    model,
    messages: [{ role: "user", content: PROBE_MESSAGE }],
    max_tokens: PROBE_MAX_TOKENS,
    stream: false,
  };
  const headers = {};
  const key = String(apiKey || "").trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const response = await httpPostJson(url, headers, payload, timeoutMs);
  if (passedStatus(response.status)) {
    return { ok: true, url, payload, response };
  }
  return {
    ok: false,
    url,
    payload,
    response,
    error: formatHttpError(response.status, response.body),
  };
}

function codexResponsesUrl(base) {
  const normalized = normalizeBaseUrl(base);
  if (normalized.endsWith("/backend-api")) {
    return `${normalized}/codex/responses`;
  }
  return "https://chatgpt.com/backend-api/codex/responses";
}

async function probeOpenAiCodexResponses(profile, timeoutMs) {
  const apiKey = String(profile.api_key || "").trim();
  const accountId = String(profile.account_id || "").trim();
  if (!accountId) {
    return {
      ok: false,
      url: codexResponsesUrl(profile.base_url),
      error: "缺少 chatgpt account_id（Codex 订阅 OAuth 凭据不完整，请重新登录）",
    };
  }

  const url = codexResponsesUrl(profile.base_url);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "chatgpt-account-id": accountId,
    "OpenAI-Beta": "responses=experimental",
    Originator: "clovapi",
    Accept: "text/event-stream",
  };

  const models = await resolveCodexTestModels(profile.model);
  let lastFailure = null;

  for (const model of models) {
    const payload = buildCodexProbePayload(model);
    const response = await probeCodexResponsesStream(url, headers, payload, timeoutMs);
    if (response.ok) {
      return {
        ok: true,
        url,
        payload,
        response,
        requested: profile.model,
        used: model,
        transport: "sse",
        ...(profile.model && model !== profile.model
          ? { fallbackFrom: `${profile.model} 不在当前 ChatGPT 账号 Codex 模型表，已自动回退` }
          : {}),
      };
    }
    lastFailure = {
      ok: false,
      url,
      payload,
      response,
      requested: profile.model,
      used: model,
      transport: "sse",
      error: response.error || formatHttpError(response.status, response.body),
    };
    if (
      response.status !== 404 &&
      !isCodexAccountUnsupportedModelError(response.body)
    ) {
      return lastFailure;
    }
  }

  return (
    lastFailure || {
      ok: false,
      url,
      error: "Codex 探测失败：无可用模型",
    }
  );
}

async function probeOpenAiResponses(base, apiKey, model, timeoutMs) {
  const url = joinV1Path(base, "responses");
  const payload = {
    model,
    input: PROBE_MESSAGE,
    max_output_tokens: PROBE_MAX_TOKENS,
  };
  const headers = {};
  const key = String(apiKey || "").trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const response = await httpPostJson(url, headers, payload, timeoutMs);
  if (passedStatus(response.status)) {
    return { ok: true, url, payload, response };
  }
  return {
    ok: false,
    url,
    payload,
    response,
    error: formatHttpError(response.status, response.body),
  };
}

async function probeAnthropicMessages(base, apiKey, model, timeoutMs, extraHeaders = {}) {
  const url = joinV1Path(base, "messages");
  const payload = {
    model,
    max_tokens: PROBE_MAX_TOKENS,
    messages: [{ role: "user", content: PROBE_MESSAGE }],
  };
  const key = String(apiKey || "").trim();
  const headers = {
    ...extraHeaders,
    "anthropic-version": "2023-06-01",
  };
  if (!headers.Authorization && key) {
    headers["x-api-key"] = key;
  }

  const response = await httpPostJson(url, headers, payload, timeoutMs);
  if (passedStatus(response.status)) {
    return { ok: true, url, payload, response };
  }
  if (response.status === 404) {
    const err = new Error(formatHttpError(response.status, response.body));
    err.code = "ANTHROPIC_MESSAGES_NOT_FOUND";
    err.captured = { ok: false, url, payload, response };
    throw err;
  }
  return {
    ok: false,
    url,
    payload,
    response,
    error: formatHttpError(response.status, response.body),
  };
}

function resolveClaudeProbeModel(profile) {
  const want = String(profile?.model || "").trim();
  if (want && want !== "default") return want;
  return CLAUDE_SUBSCRIPTION_MODEL_FALLBACKS[0];
}

async function probeClaudeSubscriptionMessages(profile, timeoutMs) {
  const apiKey = String(profile.api_key || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      url: joinV1Path(profile.base_url || ANTHROPIC_OAUTH_BASE_URL, "messages"),
      error: "缺少 Claude OAuth access_token，请重新登录 Claude 订阅。",
    };
  }

  const base = normalizeBaseUrl(profile.base_url || ANTHROPIC_OAUTH_BASE_URL);
  const url = joinV1Path(base, "messages");
  const headers = buildClaudeOAuthHeaders(apiKey);
  const model = resolveClaudeProbeModel(profile);
  const payload = buildClaudeOAuthProbePayload(model, PROBE_MESSAGE);

  const response = await probeClaudeOAuthMessagesStream(url, headers, payload, timeoutMs);
  if (response.ok) {
    return {
      ok: true,
      transport: "sse",
      url,
      payload,
      response,
      requested: profile.model,
      used: model,
    };
  }

  if (isClaudeAccountUnsupportedModelError(response.body, response.status)) {
    return {
      ok: false,
      url,
      payload,
      response,
      requested: profile.model,
      used: model,
      transport: "sse",
      error: response.error || formatHttpError(response.status, response.body),
    };
  }

  return {
    ok: false,
    url,
    payload,
    response,
    requested: profile.model,
    used: model,
    transport: "sse",
    error: response.error || formatHttpError(response.status, response.body),
  };
}

async function probeClaudeWithFallback(base, apiKey, model, timeoutMs) {
  try {
    return await probeAnthropicMessages(base, apiKey, model, timeoutMs);
  } catch (error) {
    if (error?.code !== "ANTHROPIC_MESSAGES_NOT_FOUND") {
      throw error;
    }
    let origin = base;
    try {
      const parsed = new URL(base);
      origin = `${parsed.protocol}//${parsed.host}`;
    } catch {
      throw error;
    }
    const fallback = await probeOpenAiChat(origin, apiKey, model, timeoutMs);
    return { ...fallback, fallbackFrom: "anthropic-messages-404" };
  }
}

async function runHttpProbeForPath(pathId, profile, timeoutMs) {
  const base = normalizeBaseUrl(profile.base_url);
  const apiKey = String(profile.api_key || "").trim();
  const model = String(profile.model || "").trim();

  if (pathId === "openai-chat" || pathId === "gemini") {
    return probeOpenAiChat(base, apiKey, model, timeoutMs);
  }
  if (pathId === "openai-responses") {
    return probeOpenAiResponses(base, apiKey, model, timeoutMs);
  }
  if (pathId === "openai-codex-responses") {
    return probeOpenAiCodexResponses(profile, timeoutMs);
  }
  if (pathId === "claude") {
    if (profile?.name === CLAUDE_SUB_PROFILE_NAME || isClaudeOAuthToken(apiKey)) {
      return probeClaudeSubscriptionMessages(profile, timeoutMs);
    }
    return probeClaudeWithFallback(base, apiKey, model, timeoutMs);
  }
  throw new Error(`不支持的测试路径: ${pathId}`);
}

function buildHttpReport(profile, pathId, captured, meta = {}) {
  const path = TEST_PATHS[pathId];
  const passed = Boolean(captured?.ok);
  const lines = [
    "=== API 连通性测试（HTTP）===",
    "",
    `Profile: ${profile.name}`,
    `API 风格: ${profile.api_style}`,
    `测试路径: ${path?.label || pathId}`,
    meta.adapterId ? `模型适配器: ${meta.adapterId}` : "",
    `Base URL: ${profile.base_url}`,
    `Model: ${profile.model}`,
    captured?.requested && captured?.used && captured.requested !== captured.used
      ? `实际探测 Model: ${captured.used}（${captured.requested} 不可用，已自动回退）`
      : captured?.used
        ? `实际探测 Model: ${captured.used}`
        : "",
    profile.account_id ? `ChatGPT Account: ${maskApiKey(profile.account_id)}` : "",
    captured?.transport ? `传输: ${captured.transport}` : "",
    `${isClaudeOAuthToken(profile.api_key) ? "OAuth Token" : "API Key"}: ${maskApiKey(profile.api_key)}`,
    captured?.fallbackFrom ? `Claude 回退: ${captured.fallbackFrom}` : "",
    "",
    "=== 请求 ===",
    "",
    `URL: ${captured?.url || "(未知)"}`,
    safeJson(captured?.payload),
    "",
    "=== HTTP 响应 ===",
    "",
    `Status: ${captured?.response?.status || "(未知)"}`,
    captured?.response?.body ? String(captured.response.body).trim().slice(0, 2000) : "(空)",
  ].filter(Boolean);

  if (!passed && captured?.error) {
    lines.push("");
    lines.push("--- 失败原因 ---");
    lines.push(String(captured.error));
  }

  return {
    ok: passed,
    summary: passed ? "测试成功" : "测试失败",
    text: lines.join("\n"),
    detail: {
      engine: "http",
      testPath: pathId,
      adapterId: meta.adapterId,
      profile: {
        name: profile.name,
        api_style: profile.api_style,
        base_url: profile.base_url,
        model: profile.model,
      },
      request: {
        url: captured?.url,
        payload: captured?.payload,
      },
      response: {
        status: captured?.response?.status,
        body: captured?.response?.body,
      },
      fallbackFrom: captured?.fallbackFrom ? String(captured.fallbackFrom) : undefined,
      error: captured?.error ? String(captured.error) : undefined,
    },
  };
}

async function runHttpProbe(profile, meta = {}) {
  const pathId = resolveTestPathId(profile);
  if (!pathId) {
    return buildValidationFailure(profile, `不支持的 API 风格: ${profile.api_style}`, meta);
  }

  const base = normalizeBaseUrl(profile.base_url);
  const apiKey = String(profile.api_key || "").trim();
  const model = String(profile.model || "").trim();
  const local = isLocalBaseUrl(base);
  const timeoutMs = probeTimeoutMs(profile, meta);

  if (!base) return buildValidationFailure(profile, "base_url 为空", meta);
  if (!model) return buildValidationFailure(profile, "model 为空", meta);
  if (!apiKey && !local) {
    return buildValidationFailure(profile, "api_key 为空", meta);
  }

  try {
    const captured = await runHttpProbeForPath(pathId, profile, timeoutMs);
    return buildHttpReport(profile, pathId, captured, meta);
  } catch (error) {
    const errText = error instanceof Error ? error.message : String(error);
    const captured = error?.captured || {
      ok: false,
      error: errText,
      url:
        pathId === "claude"
          ? joinV1Path(base, "messages")
          : joinV1Path(base, pathId.includes("responses") ? "responses" : "chat/completions"),
    };
    return buildHttpReport(profile, pathId, captured, meta);
  }
}

/** @deprecated 兼容旧 flat profile 入口；新代码请走 model-adapters.testVendorModel */
async function testByApiStyle(profile, meta = {}) {
  return runHttpProbe(profile, meta);
}

/** @deprecated 旧名保留，实际走 HTTP 探测 */
async function runPiAiProbe(profile, meta = {}) {
  return runHttpProbe(profile, meta);
}

module.exports = {
  TEST_PATHS,
  resolveTestPathId,
  testByApiStyle,
  runHttpProbe,
  runPiAiProbe,
};

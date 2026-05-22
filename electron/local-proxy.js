const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");
const profileStore = require("./profile-store");
const providerRegistry = require("./provider-registry");
const {
  joinUrl,
  resolveIngressContext,
  resolveLegacyCliIngress,
  buildUpstreamAuthHeaders,
} = require("./proxy-resolver");
const {
  shouldTransformRequest,
  prepareUpstreamRequest,
  transformResponse,
} = require("./protocol/pipeline");

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function isIngressModelsListRequest(method, pathSuffix) {
  if (method !== "GET" && method !== "HEAD") return false;
  const suffix = String(pathSuffix || "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return suffix === "/models" || suffix === "/v1/models";
}

/** Claude Code / OpenAI 客户端会 GET /v1/models 校验所选 model 是否在列表中。 */
function buildIngressModelsListBody(ingressStyle, modelId) {
  const id = String(modelId || "").trim();
  if (profileStore.normalizeApiStyle(ingressStyle) === "claude") {
    return JSON.stringify({ data: [{ type: "model", id, display_name: id }] });
  }
  return JSON.stringify({
    object: "list",
    data: [{ id, object: "model", owned_by: "clovapi" }],
  });
}

function filterRequestHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!key || HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function forwardRequest(upstreamUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(upstreamUrl);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        resolve(res);
      },
    );
    req.on("error", reject);
    if (body?.length) req.write(body);
    req.end();
  });
}

async function pipeAsyncIterable(stream, res) {
  for await (const chunk of stream) {
    if (!res.write(chunk)) {
      await new Promise((resolve) => res.once("drain", resolve));
    }
  }
  res.end();
}

function createLocalProxyServer(options = {}) {
  const getPort = () => Number(options.port) || 27483;

  const server = http.createServer(async (req, res) => {
    try {
      const port = getPort();
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "clovapi-local-proxy" }));
        return;
      }

      const store = await profileStore.loadStore();
      let ingress = providerRegistry.parseProxyIngressPath(url.pathname);
      if (!ingress) {
        ingress = resolveLegacyCliIngress(url.pathname, store);
      }
      if (!ingress) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "路径无效。请使用 /{providerId}/{modelId}/{apiStyle}/v1/…，例如 /claude-code/claude-opus-4-7/claude/v1/messages",
          }),
        );
        return;
      }

      const method = req.method || "GET";
      if (isIngressModelsListRequest(method, ingress.pathSuffix)) {
        const body = buildIngressModelsListBody(ingress.apiStyle, ingress.modelId);
        res.writeHead(200, { "content-type": "application/json" });
        if (method === "HEAD") res.end();
        else res.end(body);
        return;
      }

      const { upstream, ingressStyle, egressStyle } = resolveIngressContext(
        ingress.providerId,
        ingress.modelId,
        ingress.apiStyle,
        store,
      );

      const body =
        method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readBody(req);
      const headers = filterRequestHeaders(req.headers);
      Object.assign(headers, buildUpstreamAuthHeaders(upstream.api_style, upstream.api_key, upstream));

      let upstreamUrl;
      let upstreamBody = body;
      let ir = null;

      if (shouldTransformRequest(method) && body.length > 0) {
        const prepared = prepareUpstreamRequest({
          method,
          ingressStyle,
          egressStyle,
          body,
          upstream,
        });
        ir = prepared.ir;
        upstreamBody = prepared.upstreamBody;
        upstreamUrl = joinUrl(upstream.base_url, prepared.pathSuffix);
      } else {
        upstreamUrl = joinUrl(upstream.base_url, ingress.pathSuffix);
      }

      delete headers["content-length"];
      headers["content-length"] = String(upstreamBody.length);

      const upstreamRes = await forwardRequest(upstreamUrl, method, headers, upstreamBody);

      if (!shouldTransformRequest(method) || body.length === 0) {
        const responseHeaders = { ...upstreamRes.headers };
        delete responseHeaders.connection;
        res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
        upstreamRes.pipe(res);
        return;
      }

      const transformed = await transformResponse({
        ingressStyle,
        egressStyle,
        ir: ir || { stream: true },
        upstreamRes,
      });

      res.writeHead(transformed.status, transformed.headers);
      if (transformed.stream) {
        await pipeAsyncIterable(transformed.stream, res);
      } else {
        res.end(transformed.body);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    }
  });

  return server;
}

module.exports = {
  createLocalProxyServer,
};

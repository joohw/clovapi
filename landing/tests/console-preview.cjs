// Read-only UI fixture proxy. Start Next on port 3100, then run:
// node tests/console-preview.cjs
// Add --interactive-keys to simulate API key creation in memory only.
// Set CONSOLE_PREVIEW_PORT to choose a port other than 3101.
// /__preview/empty, /__preview/populated, and /__preview/retry select fixtures
// without touching real authentication, account data, or upstream credentials.
// In interactive mode, creating a key named preview-error simulates a failure.
const http = require("node:http");

const HOST = "127.0.0.1";
const PORT = Number(process.env.CONSOLE_PREVIEW_PORT || 3101);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("CONSOLE_PREVIEW_PORT must be an integer between 1 and 65535.");
}
const UPSTREAM = { hostname: "127.0.0.1", port: 3100 };
const FIXTURE_COOKIE = "clovapi_ui_preview";
const CREATED_AT = "2026-09-14T02:30:00.000Z";

function fixtureState(empty) {
  return {
    version: 1,
    userId: "preview-user",
    free: 0,
    credits: 0,
    cliKey: null,
    keys: empty ? [] : [
      { id: "preview-key-active", name: "测试项目 / Preview project", prefix: "clov_preview_active", revoked: false, createdAt: CREATED_AT },
      { id: "preview-key-revoked", name: "这是一个用于检查窄屏换行的很长的项目凭证名称 / Archived preview credential", prefix: "clov_preview_revoked", revoked: true, createdAt: CREATED_AT },
    ],
    nodes: empty ? [] : [
      { id: "preview-node-online", name: "开发机 / Preview workstation", model: "chat", budget: 100, reserve: 0, schedule: "anytime", paused: false, used: 23, day: "2026-09-14", modelId: "preview-model-chat", models: ["preview-model-chat"], deviceId: "preview-device-online", online: true, lastSeenAt: CREATED_AT, keyPrefix: "node_preview_online", keyRevoked: false },
      { id: "preview-node-paused", name: "这是一个用于验证移动端卡片内容换行的很长的节点名称 / Paused preview workstation", model: "code", budget: 1000, reserve: 0, schedule: "anytime", paused: true, used: 210, day: "2026-09-14", modelId: "preview-model-with-a-very-long-identifier-for-checking-mobile-content-wrapping-2026", models: ["preview-model-with-a-very-long-identifier-for-checking-mobile-content-wrapping-2026"], deviceId: "preview-device-paused", online: false, lastSeenAt: null, keyPrefix: "node_preview_paused", keyRevoked: false },
    ],
    entries: [],
  };
}

function json(request, response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    ...headers,
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function upstreamHeaders(request) {
  const headers = { ...request.headers, host: "localhost:3100" };
  delete headers.cookie;
  delete headers.authorization;
  delete headers["proxy-authorization"];
  if (headers.origin) headers.origin = "http://localhost:3100";
  return headers;
}

function responseHeaders(headers) {
  const result = { ...headers };
  delete result["set-cookie"];
  result["cache-control"] = "no-store";
  return result;
}

function createPreviewServer({ interactiveKeys = false } = {}) {
  const states = { empty: fixtureState(true), populated: fixtureState(false) };
  const createdCounts = { empty: 0, populated: 0 };
  const requestMode = (request) => (request.headers.cookie || "").split(";").some((part) => part.trim() === `${FIXTURE_COOKIE}=empty`) ? "empty" : "populated";

  function createFixtureKey(request, response) {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > 16_384) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        json(request, response, 413, { ok: false, error: "invalid_request" });
        return;
      }
      let action;
      try { action = JSON.parse(body); }
      catch {
        json(request, response, 400, { ok: false, error: "invalid_request" });
        return;
      }
      if (!action || action.action !== "create_key") {
        json(request, response, 403, { ok: false, error: "preview_read_only" });
        return;
      }
      const name = typeof action.name === "string" ? action.name.trim().slice(0, 36) : "";
      if (!name) {
        json(request, response, 400, { ok: false, error: "invalid_request" });
        return;
      }
      const mode = requestMode(request);
      // Delay only the fake response, making pending controls visible during QA.
      setTimeout(() => {
        if (response.destroyed) return;
        if (name === "preview-error") {
          json(request, response, 503, { ok: false, error: "backend_error" });
          return;
        }
        const state = states[mode];
        if (state.keys.length >= 8) {
          json(request, response, 400, { ok: false, error: "item_limit" });
          return;
        }
        const sequence = ++createdCounts[mode];
        const createdKey = `clv_preview_${mode}_${String(sequence).padStart(3, "0")}_not_a_real_api_key`;
        state.keys.unshift({
          id: `preview-key-${mode}-${sequence}`, name,
          prefix: `${createdKey.slice(0, 23)}…`, revoked: false, createdAt: CREATED_AT,
        });
        json(request, response, 200, { ok: true, state, createdKey });
      }, 600);
    });
    request.on("error", () => response.destroy());
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (interactiveKeys && request.method === "POST" && url.pathname === "/api/platform") {
      createFixtureKey(request, response);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      request.resume();
      json(request, response, 403, { ok: false, error: "preview_read_only" });
      return;
    }

    if (["/__preview/empty", "/__preview/populated", "/__preview/retry"].includes(url.pathname)) {
      const mode = url.pathname.split("/").at(-1);
      const locale = url.searchParams.get("locale") === "en" ? "en" : "zh-CN";
      const stateMode = mode === "empty" ? "empty" : "populated";
      states[stateMode] = fixtureState(stateMode === "empty");
      createdCounts[stateMode] = 0;
      response.writeHead(302, {
        location: `/${locale}/console`,
        "set-cookie": `${FIXTURE_COOKIE}=${mode}; Path=/; HttpOnly; SameSite=Lax`,
        "cache-control": "no-store",
      });
      response.end();
      return;
    }

    if (url.pathname === "/api/auth/session") {
      const retry = (request.headers.cookie || "").split(";").some((part) => part.trim() === `${FIXTURE_COOKIE}=retry`);
      if (retry) {
        json(request, response, 503, { ok: false, error: "preview_temporary_failure" }, {
          "set-cookie": `${FIXTURE_COOKIE}=populated; Path=/; HttpOnly; SameSite=Lax`,
        });
        return;
      }
      json(request, response, 200, { ok: true, user: { id: "preview-user", email: "preview@example.test" } });
      return;
    }

    if (url.pathname === "/api/platform") {
      const mode = requestMode(request);
      json(request, response, 200, { ok: true, state: interactiveKeys ? states[mode] : fixtureState(mode === "empty") });
      return;
    }

    // Any additional API surface stays isolated even when requested manually.
    if (/^\/(?:api|v1)(?:\/|$)/.test(url.pathname)) {
      json(request, response, 403, { ok: false, error: "preview_api_unavailable" });
      return;
    }

    const upstream = http.request({ ...UPSTREAM, method: request.method, path: request.url, headers: upstreamHeaders(request) }, (incoming) => {
      response.writeHead(incoming.statusCode, responseHeaders(incoming.headers));
      incoming.pipe(response);
    });
    upstream.on("error", () => {
      if (!response.headersSent) json(request, response, 502, { ok: false, error: "preview_upstream_unavailable" });
      else response.destroy();
    });
    request.on("aborted", () => upstream.destroy());
    response.on("close", () => upstream.destroy());
    upstream.end();
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    // Only Next's development HMR connection may use the WebSocket tunnel.
    if (request.method !== "GET" || url.pathname !== "/_next/webpack-hmr") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = http.request({ ...UPSTREAM, method: "GET", path: request.url, headers: upstreamHeaders(request) });
    upstream.on("upgrade", (incoming, remote, upstreamHead) => {
      let handshake = `HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\n`;
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (name === "set-cookie") continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) handshake += `${name}: ${item}\r\n`;
        }
      }
      socket.write(`${handshake}\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) remote.write(head);
      remote.on("error", () => socket.destroy());
      socket.on("error", () => remote.destroy());
      remote.on("close", () => socket.destroy());
      socket.on("close", () => remote.destroy());
      remote.pipe(socket);
      socket.pipe(remote);
    });
    upstream.on("response", (incoming) => {
      incoming.resume();
      socket.end(`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\nConnection: close\r\n\r\n`);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    upstream.end();
  });
  return server;
}

if (require.main === module) {
  const interactiveKeys = process.argv.includes("--interactive-keys");
  const server = createPreviewServer({ interactiveKeys });
  server.listen(PORT, HOST, () => {
    process.stdout.write(`${interactiveKeys ? "Simulated key creation" : "Read-only"} console preview: http://${HOST}:${PORT}/__preview/populated\n`);
    process.stdout.write(`Empty console preview: http://${HOST}:${PORT}/__preview/empty\n`);
    process.stdout.write(`Session retry preview: http://${HOST}:${PORT}/__preview/retry\n`);
  });
  server.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { createPreviewServer, fixtureState };

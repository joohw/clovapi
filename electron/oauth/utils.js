const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");

const CALLBACK_HOST = process.env.CLOVAPI_OAUTH_CALLBACK_HOST || "127.0.0.1";

function loginCancelledError() {
  const err = new Error("已取消登录");
  err.code = "LOGIN_CANCELLED";
  return err;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function oauthHtml(kind, message, details) {
  const heading = kind === "success" ? "登录成功" : "登录失败";
  const detailBlock = details
    ? `<p class="details">${escapeHtml(details)}</p>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${heading}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px auto; max-width: 480px; text-align: center; color: #111; }
    h1 { font-size: 1.25rem; }
    p { color: #444; line-height: 1.6; }
    .details { font-family: monospace; font-size: 0.85rem; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${heading}</h1>
  <p>${escapeHtml(message)}</p>
  ${detailBlock}
</body>
</html>`;
}

function base64urlEncode(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generatePKCE() {
  const verifierBytes = crypto.randomBytes(32);
  const verifier = base64urlEncode(verifierBytes);
  const challenge = base64urlEncode(
    crypto.createHash("sha256").update(verifier, "utf8").digest(),
  );
  return { verifier, challenge };
}

function createOAuthState() {
  return crypto.randomBytes(16).toString("hex");
}

function isCallbackPortAvailable(port, host = CALLBACK_HOST) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err) => {
      resolve({ ok: false, inUse: err && err.code === "EADDRINUSE" });
    });
    probe.once("listening", () => {
      probe.close(() => resolve({ ok: true, inUse: false }));
    });
    probe.listen(port, host);
  });
}

/**
 * @param {object} options
 * @param {number} options.port
 * @param {string} options.path - e.g. "/callback" or "/auth/callback"
 * @param {(query: URLSearchParams) => { ok: true, data?: object } | { ok: false, status: number, message: string, details?: string }} options.validate
 * @param {AbortSignal} [options.signal]
 */
function startCallbackServer(options) {
  const { port, path, validate, signal } = options;
  const host = options.host || CALLBACK_HOST;

  return new Promise((resolve, reject) => {
    let settled = false;
    let waitResolve;
    let waitReject;

    const waitPromise = new Promise((res, rej) => {
      waitResolve = res;
      waitReject = rej;
    });

    const finishWait = (value) => {
      if (settled) return;
      settled = true;
      waitResolve(value);
    };

    const failWait = (err) => {
      if (settled) return;
      settled = true;
      waitReject(err);
    };

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", `http://localhost:${port}`);
        if (url.pathname !== path) {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(oauthHtml("error", "回调路径不正确。"));
          return;
        }

        const result = validate(url.searchParams);
        if (!result.ok) {
          res.writeHead(result.status || 400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(oauthHtml("error", result.message, result.details));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(oauthHtml("success", "授权完成，可以关闭此窗口并返回 ClovAPI。"));
        finishWait(result.data || {});
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal error");
      }
    });

    const closeServer = () => {
      try {
        server.close();
      } catch {
        // ignore
      }
    };

    const onAbort = () => {
      closeServer();
      failWait(loginCancelledError());
    };

    if (signal) {
      if (signal.aborted) {
        reject(loginCancelledError());
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    server.once("error", (err) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    server.listen(port, host, () => {
      resolve({
        waitForCallback: () => waitPromise,
        close: () => {
          if (signal) signal.removeEventListener("abort", onAbort);
          closeServer();
          if (!settled) failWait(loginCancelledError());
        },
      });
    });
  });
}

function waitWithTimeout(promise, ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(loginCancelledError());
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`登录超时（${Math.round(ms / 60000)} 分钟），请重试。`));
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(loginCancelledError());
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
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

module.exports = {
  CALLBACK_HOST,
  loginCancelledError,
  generatePKCE,
  createOAuthState,
  isCallbackPortAvailable,
  startCallbackServer,
  waitWithTimeout,
  decodeJwtPayload,
};

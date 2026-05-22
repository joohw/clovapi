const { getDecoder, getEncoder } = require("./registry");
const { normalizeStyle } = require("./ir");
const { enrichIrRequest, resolveUpstreamPath } = require("./gateway");
const {
  sanitizeUpstreamResponseHeaders,
  decompressResponseBody,
  createDecompressStream,
} = require("../proxy-response-headers");

async function readStream(stream, contentEncoding = "", onBody) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = decompressResponseBody(Buffer.concat(chunks), contentEncoding);
  if (body.length && typeof onBody === "function") onBody(body);
  return body;
}

async function* nodeStreamChunks(nodeStream, onChunk) {
  for await (const chunk of nodeStream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (buf.length && typeof onChunk === "function") onChunk(buf);
    yield buf;
  }
}

/**
 * @param {object} ctx
 * @param {import('./ir').IrRequest} ctx.ir
 * @param {import('http').IncomingMessage} ctx.upstreamRes
 */
async function transformResponse(ctx) {
  const ingressStyle = normalizeStyle(ctx.ingressStyle);
  const egressStyle = normalizeStyle(ctx.egressStyle);
  const egressDecoder = getDecoder(egressStyle);
  const ingressEncoder = getEncoder(ingressStyle);

  const upstreamRes = ctx.upstreamRes;
  const status = upstreamRes.statusCode || 502;
  const headers = sanitizeUpstreamResponseHeaders(upstreamRes.headers);

  const wantsStream = ctx.ir?.stream !== false;
  const ct = String(headers["content-type"] || "").toLowerCase();
  const streamLike = ct.includes("text/event-stream");
  const ingressWantsSse = wantsStream && ingressStyle === "claude";

  async function* eventsWithModel(source) {
    if (ctx.ir?.model) {
      yield { type: "message_start", role: "assistant", model: ctx.ir.model };
    }
    for await (const event of source) yield event;
  }

  if (streamLike && wantsStream) {
    const decompress = createDecompressStream(upstreamRes.headers["content-encoding"]);
    const bodyStream = decompress ? upstreamRes.pipe(decompress) : upstreamRes;
    const events = eventsWithModel(
      egressDecoder.decodeSseStream(nodeStreamChunks(bodyStream, ctx.onUpstreamBodyChunk)),
    );
    const encoded = ingressEncoder.encodeSseStream(events);
    return {
      status,
      headers: {
        ...headers,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      stream: encoded,
    };
  }

  // 非 SSE 错误（如 429 JSON）先写状态头，避免客户端长时间收不到任何字节
  if (!streamLike && status >= 400) {
    const raw = await readStream(
      upstreamRes,
      upstreamRes.headers["content-encoding"],
      ctx.onUpstreamBodyChunk,
    );
    let events;
    try {
      events =
        raw.length > 0
          ? egressDecoder.decodeResponseJson(raw)
          : [{ type: "error", message: `upstream HTTP ${status}`, code: "upstream_error" }];
    } catch (error) {
      events = [
        {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }
    if (ingressWantsSse) {
      const encoded = ingressEncoder.encodeSseStream(
        (async function* () {
          for (const event of events) yield event;
        })(),
      );
      return {
        status,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
        stream: encoded,
      };
    }
    const body = ingressEncoder.encodeResponseJson(events);
    return {
      status,
      headers: {
        "content-type": "application/json",
        "content-length": String(body.length),
      },
      body,
    };
  }

  const raw = await readStream(
    upstreamRes,
    upstreamRes.headers["content-encoding"],
    ctx.onUpstreamBodyChunk,
  );
  let events;
  try {
    if (streamLike) {
      async function* once() {
        if (raw.length) yield raw;
      }
      events = [];
      for await (const event of egressDecoder.decodeSseStream(once())) {
        events.push(event);
      }
    } else if (raw.length > 0) {
      events = egressDecoder.decodeResponseJson(raw);
    } else {
      events = [{ type: "error", message: "empty upstream response" }];
    }
  } catch (error) {
    events = [
      {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }

  if (ingressWantsSse) {
    async function* eventIter() {
      yield* eventsWithModel(
        (async function* () {
          for (const event of events) yield event;
        })(),
      );
    }
    const encoded = ingressEncoder.encodeSseStream(eventIter());
    return {
      status,
      headers: {
        ...headers,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      stream: encoded,
    };
  }

  const body = ingressEncoder.encodeResponseJson(events);
  return {
    status,
    headers: {
      ...headers,
      "content-type": "application/json",
      "content-length": String(body.length),
    },
    body,
  };
}

/**
 * @param {object} ctx
 * @returns {Promise<{ upstreamBody: Buffer, ir: import('./ir').IrRequest, pathSuffix: string }>}
 */
function prepareUpstreamRequest(ctx) {
  const ingressStyle = normalizeStyle(ctx.ingressStyle);
  const egressStyle = normalizeStyle(ctx.egressStyle);
  const ingressDecoder = getDecoder(ingressStyle);
  const egressEncoder = getEncoder(egressStyle);

  let ir = ingressDecoder.decodeRequest(ctx.body);
  ir = enrichIrRequest(ir, ctx.upstream);
  if (!ir.model) {
    throw new Error("缺少 model（请在请求体或供应商配置中指定）");
  }
  const pathSuffix = resolveUpstreamPath(egressStyle, ir, ctx.upstream);
  const upstreamBody = egressEncoder.encodeRequest(ir);
  return { upstreamBody, ir, pathSuffix };
}

function shouldTransformRequest(method) {
  const m = String(method || "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH";
}

module.exports = {
  shouldTransformRequest,
  prepareUpstreamRequest,
  transformResponse,
  readStream,
  nodeStreamChunks,
};

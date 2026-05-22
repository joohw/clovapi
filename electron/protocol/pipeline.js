const { getDecoder, getEncoder } = require("./registry");
const { normalizeStyle } = require("./ir");
const { enrichIrRequest, resolveUpstreamPath } = require("./gateway");

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function* nodeStreamChunks(nodeStream) {
  for await (const chunk of nodeStream) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
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
  const headers = { ...upstreamRes.headers };
  delete headers.connection;
  delete headers["content-length"];
  delete headers["transfer-encoding"];

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
    const events = eventsWithModel(egressDecoder.decodeSseStream(nodeStreamChunks(upstreamRes)));
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

  const raw = await readStream(upstreamRes);
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

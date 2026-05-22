const { formatClaudeSse } = require("../sse");

function newMessageId() {
  return `msg_${Date.now().toString(36)}`;
}

function claudeMessageStartPayload(messageId, model) {
  return {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model: model || "claude-proxy",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  };
}

function encodeRequest(ir) {
  const body = {
    model: ir.model,
    max_tokens: ir.max_tokens ?? 1024,
    messages: ir.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: ir.stream !== false,
  };
  if (ir.temperature != null) body.temperature = ir.temperature;
  if (ir.metadata?.system) body.system = ir.metadata.system;
  return Buffer.from(JSON.stringify(body));
}

function eventsToMessage(events) {
  let text = "";
  let stop = "end_turn";
  for (const e of events) {
    if (e.type === "text_delta") text += e.text || "";
    if (e.type === "finish") stop = e.reason || stop;
  }
  return {
    id: "msg_proxy",
    type: "message",
    role: "assistant",
    model: events.find((e) => e.type === "message_start")?.model,
    content: [{ type: "text", text }],
    stop_reason: stop,
  };
}

function encodeResponseJson(events) {
  const err = events.find((e) => e.type === "error");
  if (err) {
    return Buffer.from(
      JSON.stringify({
        type: "error",
        error: { type: err.code || "api_error", message: err.message || "error" },
      }),
    );
  }
  return Buffer.from(JSON.stringify(eventsToMessage(events)));
}

async function* encodeSseStream(eventSource) {
  const messageId = newMessageId();
  let model;
  let started = false;
  let blockOpen = false;

  const ensureStarted = function* () {
    if (started) return;
    started = true;
    blockOpen = true;
    yield Buffer.from(formatClaudeSse("message_start", claudeMessageStartPayload(messageId, model)));
    yield Buffer.from(
      formatClaudeSse("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
    );
  };

  const closeStream = function* (reason) {
    if (!blockOpen) return;
    yield Buffer.from(
      formatClaudeSse("content_block_stop", {
        type: "content_block_stop",
        index: 0,
      }),
    );
    yield Buffer.from(
      formatClaudeSse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: reason || "end_turn" },
      }),
    );
    yield Buffer.from(formatClaudeSse("message_stop", { type: "message_stop" }));
    blockOpen = false;
  };

  for await (const event of eventSource) {
    if (event.type === "message_start" && event.model) {
      model = event.model;
      continue;
    }
    if (event.type === "error") {
      yield Buffer.from(
        formatClaudeSse("error", {
          type: "error",
          error: { type: event.code || "api_error", message: event.message },
        }),
      );
      return;
    }
    if (event.type === "text_delta" && event.text) {
      yield* ensureStarted();
      yield Buffer.from(
        formatClaudeSse("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: event.text },
        }),
      );
    }
    if (event.type === "finish") {
      yield* ensureStarted();
      yield* closeStream(event.reason);
      return;
    }
  }

  if (blockOpen) {
    yield* closeStream("end_turn");
  } else if (!started) {
    yield Buffer.from(
      formatClaudeSse("error", {
        type: "error",
        error: { type: "api_error", message: "empty upstream response" },
      }),
    );
  }
}

module.exports = {
  encodeRequest,
  encodeResponseJson,
  encodeSseStream,
};

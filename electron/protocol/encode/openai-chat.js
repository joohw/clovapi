const { formatOpenAiSseData, formatOpenAiDone } = require("../sse");

function encodeRequest(ir) {
  const body = {
    model: ir.model,
    messages: ir.messages.map((m) => {
      const msg = { role: m.role, content: m.content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    }),
    stream: ir.stream !== false,
  };
  if (ir.max_tokens != null) body.max_tokens = ir.max_tokens;
  if (ir.temperature != null) body.temperature = ir.temperature;
  if (ir.tools?.length) {
    body.tools = ir.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));
  }
  return Buffer.from(JSON.stringify(body));
}

function encodeResponseJson(events) {
  const err = events.find((e) => e.type === "error");
  if (err) {
    return Buffer.from(
      JSON.stringify({ error: { message: err.message, type: err.code || "api_error" } }),
    );
  }
  let text = "";
  let reason = "stop";
  let model;
  for (const e of events) {
    if (e.type === "text_delta") text += e.text || "";
    if (e.type === "finish") reason = e.reason || reason;
    if (e.type === "message_start") model = e.model;
  }
  const usage = events.find((e) => e.type === "usage");
  const payload = {
    id: "chatcmpl-proxy",
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: reason,
      },
    ],
  };
  if (usage) {
    payload.usage = {
      prompt_tokens: usage.input_tokens,
      completion_tokens: usage.output_tokens,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    };
  }
  return Buffer.from(JSON.stringify(payload));
}

async function* encodeSseStream(eventSource) {
  const id = "chatcmpl-proxy";
  let sentRole = false;
  for await (const event of eventSource) {
    if (event.type === "error") {
      yield Buffer.from(
        formatOpenAiSseData({ error: { message: event.message, type: event.code || "api_error" } }),
      );
      return;
    }
    if (event.type === "message_start" && !sentRole) {
      sentRole = true;
      yield Buffer.from(
        formatOpenAiSseData({
          id,
          object: "chat.completion.chunk",
          model: event.model,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        }),
      );
    }
    if (event.type === "text_delta" && event.text) {
      yield Buffer.from(
        formatOpenAiSseData({
          id,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }],
        }),
      );
    }
    if (event.type === "finish") {
      yield Buffer.from(
        formatOpenAiSseData({
          id,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: {}, finish_reason: event.reason || "stop" }],
        }),
      );
    }
  }
  yield Buffer.from(formatOpenAiDone());
}

module.exports = {
  encodeRequest,
  encodeResponseJson,
  encodeSseStream,
};

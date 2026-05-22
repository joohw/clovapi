const { createIrRequest, partitionSystemMessages } = require("../ir");
const { parseSseChunk } = require("../sse");

function decodeRequest(body) {
  const raw = JSON.parse(String(body || "{}"));
  const { messages, system } = partitionSystemMessages(raw.messages, raw.system);
  return createIrRequest({
    model: raw.model,
    messages,
    stream: raw.stream !== false,
    max_tokens: raw.max_tokens,
    temperature: raw.temperature,
    metadata: system ? { system } : undefined,
  });
}

function messageToEvents(message) {
  const events = [
    {
      type: "message_start",
      role: "assistant",
      model: message?.model,
    },
  ];
  const blocks = Array.isArray(message?.content) ? message.content : [];
  for (const block of blocks) {
    if (block?.type === "text") {
      events.push({ type: "text_delta", text: String(block.text || "") });
    }
  }
  events.push({ type: "finish", reason: String(message?.stop_reason || "end_turn") });
  return events;
}

function decodeResponseJson(body) {
  const raw = JSON.parse(String(body || "{}"));
  if (raw?.type === "error" || raw?.error) {
    const err = raw.error || raw;
    return [{ type: "error", message: String(err.message || err.type || "upstream error"), code: err.type }];
  }
  return messageToEvents(raw);
}

async function* decodeSseStream(chunks) {
  const state = { buffer: "" };
  for await (const chunk of chunks) {
    for (const record of parseSseChunk(chunk, state)) {
      if (record.data === "[DONE]") continue;
      let payload;
      try {
        payload = JSON.parse(record.data);
      } catch {
        continue;
      }
      if (payload?.type === "error" || payload?.error) {
        const err = payload.error || payload;
        yield {
          type: "error",
          message: String(err.message || err.type || "upstream error"),
          code: err.type,
        };
        return;
      }
      if (payload?.type === "message_start") {
        yield { type: "message_start", role: "assistant", model: payload.message?.model };
      }
      if (payload?.type === "content_block_delta") {
        const text = payload.delta?.text ?? payload.delta?.partial_json ?? "";
        if (text) yield { type: "text_delta", text: String(text) };
      }
      if (payload?.type === "message_delta") {
        const reason = payload.delta?.stop_reason;
        if (reason) yield { type: "finish", reason: String(reason) };
      }
      if (payload?.type === "message_stop") {
        yield { type: "finish", reason: "end_turn" };
      }
    }
  }
}

module.exports = {
  decodeRequest,
  decodeResponseJson,
  decodeSseStream,
};

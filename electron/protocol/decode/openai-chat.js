const { createIrRequest, textContent } = require("../ir");
const { parseSseChunk } = require("../sse");

function mapOpenAiMessages(messages) {
  const out = [];
  for (const msg of messages || []) {
    const role = String(msg?.role || "user").trim().toLowerCase();
    if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
      const entry = { role, content: textContent(msg.content) };
      if (msg.tool_call_id) entry.tool_call_id = String(msg.tool_call_id);
      if (msg.name) entry.name = String(msg.name);
      out.push(entry);
    }
  }
  return out;
}

function mapTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  return tools
    .map((tool) => {
      const fn = tool?.function || tool;
      if (!fn?.name) return null;
      return {
        name: String(fn.name),
        description: fn.description ? String(fn.description) : undefined,
        parameters: fn.parameters,
      };
    })
    .filter(Boolean);
}

function decodeRequest(body) {
  const raw = JSON.parse(String(body || "{}"));
  return createIrRequest({
    model: raw.model,
    messages: mapOpenAiMessages(raw.messages),
    stream: raw.stream !== false,
    max_tokens: raw.max_tokens,
    temperature: raw.temperature,
    tools: mapTools(raw.tools),
  });
}

function decodeResponseJson(body) {
  const raw = JSON.parse(String(body || "{}"));
  if (raw?.error) {
    return [
      {
        type: "error",
        message: String(raw.error.message || "upstream error"),
        code: raw.error.type,
      },
    ];
  }
  const choice = raw?.choices?.[0];
  const msg = choice?.message || {};
  const events = [
    { type: "message_start", role: "assistant", model: raw.model },
    { type: "text_delta", text: textContent(msg.content) },
    { type: "finish", reason: String(choice?.finish_reason || "stop") },
  ];
  if (raw.usage) {
    events.push({
      type: "usage",
      input_tokens: raw.usage.prompt_tokens,
      output_tokens: raw.usage.completion_tokens,
    });
  }
  return events;
}

async function* decodeSseStream(chunks) {
  const state = { buffer: "" };
  let started = false;
  for await (const chunk of chunks) {
    for (const record of parseSseChunk(chunk, state)) {
      if (record.data === "[DONE]") {
        yield { type: "finish", reason: "stop" };
        continue;
      }
      let payload;
      try {
        payload = JSON.parse(record.data);
      } catch {
        continue;
      }
      if (payload?.error) {
        yield {
          type: "error",
          message: String(payload.error.message || "upstream error"),
          code: payload.error.type,
        };
        continue;
      }
      if (!started) {
        started = true;
        yield { type: "message_start", role: "assistant", model: payload.model };
      }
      const delta = payload?.choices?.[0]?.delta;
      if (delta?.content) yield { type: "text_delta", text: String(delta.content) };
      const reason = payload?.choices?.[0]?.finish_reason;
      if (reason) yield { type: "finish", reason: String(reason) };
    }
  }
}

module.exports = {
  decodeRequest,
  decodeResponseJson,
  decodeSseStream,
};

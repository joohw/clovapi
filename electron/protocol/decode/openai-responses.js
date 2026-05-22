const { createIrRequest, textContent } = require("../ir");
const { parseSseChunk } = require("../sse");

function extractResponseText(response) {
  let text = "";
  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    for (const part of item?.content || []) {
      if (part?.type === "output_text" || part?.type === "text") {
        text += String(part.text || "");
      }
    }
  }
  return text;
}

function extractDeltaText(payload) {
  const delta = payload?.delta;
  if (typeof delta === "string") return delta;
  if (delta && typeof delta === "object") {
    return String(delta.text || delta.content || delta.value || "");
  }
  return String(payload.text || payload.output_text || "");
}

function inputToMessages(input) {
  const out = [];
  if (typeof input === "string") {
    out.push({ role: "user", content: input });
    return out;
  }
  if (!Array.isArray(input)) return out;
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || "").trim().toLowerCase();
    if (type === "message") {
      const role = String(item.role || "user").trim().toLowerCase();
      out.push({ role, content: textContent(item.content) });
    } else if (type === "input_text" || type === "text") {
      out.push({ role: "user", content: textContent(item.text || item.content) });
    }
  }
  return out;
}

function decodeRequest(body) {
  const raw = JSON.parse(String(body || "{}"));
  return createIrRequest({
    model: raw.model,
    messages: inputToMessages(raw.input),
    stream: raw.stream !== false,
    max_tokens: raw.max_output_tokens ?? raw.max_tokens,
    temperature: raw.temperature,
    metadata: { instructions: raw.instructions },
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
  let text = "";
  const output = Array.isArray(raw.output) ? raw.output : [];
  for (const item of output) {
    if (item?.type === "message") {
      text += textContent(item.content);
    }
  }
  return [
    { type: "message_start", role: "assistant", model: raw.model },
    { type: "text_delta", text },
    { type: "finish", reason: String(raw.status || "completed") },
  ];
}

async function* decodeSseStream(chunks) {
  const state = { buffer: "" };
  let started = false;
  for await (const chunk of chunks) {
    for (const record of parseSseChunk(chunk, state)) {
      if (record.data === "[DONE]") {
        yield { type: "finish", reason: "completed" };
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
      const type = String(payload?.type || record.event || "").trim();
      if (!started && (type.includes("response") || payload?.response)) {
        started = true;
        yield {
          type: "message_start",
          role: "assistant",
          model: payload.response?.model || payload.model,
        };
      }
      if (type.includes("output_text.delta") || type.includes("text.delta")) {
        const text = extractDeltaText(payload);
        if (text) yield { type: "text_delta", text };
      }
      if (type.includes("output_text.done")) {
        const text = extractDeltaText(payload) || extractResponseText(payload);
        if (text) yield { type: "text_delta", text };
      }
      if (type.includes("completed") || payload?.status === "completed") {
        const text = extractResponseText(payload.response || payload);
        if (text) yield { type: "text_delta", text };
        yield { type: "finish", reason: "completed" };
      }
      if (type.includes("failed") || payload?.status === "failed") {
        yield {
          type: "error",
          message: String(payload?.response?.error?.message || payload?.error?.message || "upstream failed"),
          code: payload?.response?.error?.type || payload?.error?.type,
        };
      }
    }
  }
}

module.exports = {
  decodeRequest,
  decodeResponseJson,
  decodeSseStream,
};

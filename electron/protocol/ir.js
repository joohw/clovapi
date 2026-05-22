/** @typedef {'user' | 'assistant' | 'system' | 'tool'} IrRole */

/**
 * @typedef {object} IrMessage
 * @property {IrRole} role
 * @property {string} content
 * @property {string} [tool_call_id]
 * @property {string} [name]
 */

/**
 * @typedef {object} IrTool
 * @property {string} name
 * @property {string} [description]
 * @property {object} [parameters]
 */

/**
 * @typedef {object} IrRequest
 * @property {string} model
 * @property {IrMessage[]} messages
 * @property {boolean} stream
 * @property {IrTool[]} [tools]
 * @property {number} [max_tokens]
 * @property {number} [temperature]
 * @property {object} [metadata]
 */

/**
 * @typedef {object} IrEvent
 * @property {'message_start' | 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'usage' | 'finish' | 'error'} type
 * @property {string} [text]
 * @property {string} [id]
 * @property {string} [name]
 * @property {string} [argsFragment]
 * @property {string} [role]
 * @property {string} [model]
 * @property {string} [reason]
 * @property {number} [input_tokens]
 * @property {number} [output_tokens]
 * @property {string} [message]
 * @property {string} [code]
 */

const API_STYLES = ["claude", "openai-chat", "openai-responses", "gemini"];

function normalizeStyle(style) {
  const s = String(style || "").trim().toLowerCase();
  if (s === "openai") return "openai-responses";
  if (API_STYLES.includes(s)) return s;
  return "";
}

function textContent(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (part.type === "text" || part.type === "input_text" || part.type === "output_text") {
          return String(part.text || "").trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
}

/** Normalize Anthropic/OpenAI `system` field (string or text blocks) to plain text. */
function systemText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (part && typeof part === "object") return textContent(part.text ?? part);
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (typeof value === "object") return textContent(value.text ?? value);
  return String(value).trim();
}

/**
 * Split system prompt from message list (Messages API: system is top-level, not a message role).
 * @param {IrMessage[]} messages
 * @param {unknown} [extraSystem] raw top-level `system` from request JSON
 */
function partitionSystemMessages(messages, extraSystem) {
  const apiMessages = [];
  const systemParts = [];
  const extra = systemText(extraSystem);
  if (extra) systemParts.push(extra);

  for (const msg of messages || []) {
    const role = String(msg?.role || "user").trim().toLowerCase();
    if (role === "system") {
      const text = textContent(msg.content);
      if (text) systemParts.push(text);
      continue;
    }
    if (role === "user" || role === "assistant" || role === "tool") {
      const entry = { role, content: textContent(msg.content) };
      if (msg.tool_call_id) entry.tool_call_id = String(msg.tool_call_id);
      if (msg.name) entry.name = String(msg.name);
      apiMessages.push(entry);
    }
  }

  return {
    messages: apiMessages,
    system: systemParts.length ? systemParts.join("\n\n") : undefined,
  };
}

/** @param {Partial<IrRequest>} ir */
function collectSystemPrompt(ir) {
  const parts = [];
  const fromMeta = systemText(ir?.metadata?.system);
  if (fromMeta) parts.push(fromMeta);
  for (const msg of ir?.messages || []) {
    if (String(msg.role || "").toLowerCase() !== "system") continue;
    const text = textContent(msg.content);
    if (text) parts.push(text);
  }
  if (!parts.length) return undefined;
  return parts.join("\n\n");
}

/** User/assistant messages only (for Claude Messages API). */
function claudeApiMessages(messages) {
  const out = [];
  for (const msg of messages || []) {
    const role = String(msg?.role || "").trim().toLowerCase();
    if (role === "user" || role === "assistant") {
      out.push({ role, content: msg.content });
    }
  }
  return out;
}

/** @param {Partial<IrRequest>} partial */
function createIrRequest(partial = {}) {
  return {
    model: String(partial.model || "").trim(),
    messages: Array.isArray(partial.messages) ? partial.messages : [],
    stream: partial.stream !== false,
    tools: Array.isArray(partial.tools) ? partial.tools : undefined,
    max_tokens: partial.max_tokens,
    temperature: partial.temperature,
    metadata: partial.metadata,
  };
}

/** @param {IrEvent} event */
function cloneEvent(event) {
  return { ...event };
}

/**
 * @param {AsyncIterable<IrEvent> | IrEvent[]} source
 * @returns {Promise<IrEvent[]>}
 */
async function collectEvents(source) {
  if (Array.isArray(source)) return source.map(cloneEvent);
  const out = [];
  for await (const event of source) {
    out.push(cloneEvent(event));
  }
  return out;
}

module.exports = {
  API_STYLES,
  normalizeStyle,
  textContent,
  systemText,
  partitionSystemMessages,
  collectSystemPrompt,
  claudeApiMessages,
  createIrRequest,
  cloneEvent,
  collectEvents,
};

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
  createIrRequest,
  cloneEvent,
  collectEvents,
};

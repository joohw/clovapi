const { TextDecoder } = require("node:util");

/**
 * Parse SSE bytes into { event, data } records (data may span multiple lines).
 * @param {Buffer | string} chunk
 * @param {{ buffer: string }} state
 * @returns {{ event: string, data: string }[]}
 */
function parseSseChunk(chunk, state) {
  state.buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  const records = [];
  const blocks = state.buffer.split(/\n\n/);
  state.buffer = blocks.pop() || "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    records.push({ event, data: dataLines.join("\n") });
  }
  return records;
}

function formatOpenAiSseData(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function formatOpenAiDone() {
  return "data: [DONE]\n\n";
}

function formatClaudeSse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

module.exports = {
  parseSseChunk,
  formatOpenAiSseData,
  formatOpenAiDone,
  formatClaudeSse,
};

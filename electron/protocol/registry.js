const { normalizeStyle } = require("./ir");

const decoders = {
  claude: require("./decode/claude"),
  "openai-chat": require("./decode/openai-chat"),
  "openai-responses": require("./decode/openai-responses"),
  gemini: require("./decode/gemini"),
};

const encoders = {
  claude: require("./encode/claude"),
  "openai-chat": require("./encode/openai-chat"),
  "openai-responses": require("./encode/openai-responses"),
  gemini: require("./encode/gemini"),
};

function getDecoder(style) {
  const key = normalizeStyle(style);
  const decoder = decoders[key];
  if (!decoder) throw new Error(`不支持的 ingress 协议: ${style}`);
  return decoder;
}

function getEncoder(style) {
  const key = normalizeStyle(style);
  const encoder = encoders[key];
  if (!encoder) throw new Error(`不支持的 egress 协议: ${style}`);
  return encoder;
}

module.exports = {
  getDecoder,
  getEncoder,
};

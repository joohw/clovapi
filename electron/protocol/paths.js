const { normalizeStyle } = require("./ir");

function defaultUpstreamPathSuffix(egressStyle, upstream) {
  const style = normalizeStyle(egressStyle);
  if (upstream?.source === "subscription:codex") return "/codex/responses";
  if (style === "claude") return "/messages";
  if (style === "openai-responses") return "/responses";
  return "/chat/completions";
}

function expectedIngressPathSuffix(ingressStyle, upstream = null) {
  return defaultUpstreamPathSuffix(ingressStyle, upstream);
}

module.exports = {
  defaultUpstreamPathSuffix,
  expectedIngressPathSuffix,
};

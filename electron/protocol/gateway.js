const { createIrRequest } = require("./ir");
const { defaultUpstreamPathSuffix } = require("./paths");

/**
 * @param {import('./ir').IrRequest} ir
 * @param {{ model?: string, api_style?: string }} upstream
 */
function enrichIrRequest(ir, upstream) {
  const model = String(upstream?.model || "").trim();
  // 代理路径已选定模型；覆盖客户端 body 里的 model（避免 Claude Code 填 Anthropic 名导致上游错模）。
  if (model) ir.model = model;
  if (ir.stream == null) ir.stream = true;
  if (upstream?.source === "subscription:codex") {
    ir.metadata = { ...(ir.metadata || {}), codexSubscription: true };
  }
  if (upstream?.source === "subscription:claude-code") {
    ir.metadata = { ...(ir.metadata || {}), subscriptionClaudeOAuth: true };
  }
  return ir;
}

function resolveUpstreamPath(egressStyle, ir, upstream) {
  return defaultUpstreamPathSuffix(egressStyle, upstream);
}

module.exports = {
  enrichIrRequest,
  resolveUpstreamPath,
};

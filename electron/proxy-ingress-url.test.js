const assert = require("node:assert/strict");
const test = require("node:test");
const { buildProxyIngressBaseUrl, parseProxyIngressPath } = require("./provider-registry");

test("ingress URL encodes slashes and spaces in modelId", () => {
  const raw = "m / space";
  const url = buildProxyIngressBaseUrl(27483, "custom-api", raw, "openai-chat");
  assert.ok(url.endsWith(`/custom-api/${encodeURIComponent(raw)}/openai-chat`));
  assert.equal(new URL(url).pathname, `/custom-api/${encodeURIComponent(raw)}/openai-chat`);
});

test("ingress URL preserves already-encoded %-segments via encodeURIComponent", () => {
  const rawId = "a%2Fb";
  const encSegment = `/ollama/${encodeURIComponent(rawId)}/claude`;
  const parsed = parseProxyIngressPath(`${encSegment}/v1/chat`);
  assert.equal(parsed?.providerId, "ollama");
  assert.equal(parsed?.modelId, rawId);
  assert.equal(parsed?.apiStyle, "claude");
});

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildProxyIngressBaseUrl, parseProxyIngressPath } = require("./provider-registry");

test("ingress URL encodes slashes and spaces in modelId", () => {
  const raw = "m / space";
  const url = buildProxyIngressBaseUrl(27483, "custom-api", raw, "openai-chat");
  assert.ok(url.endsWith(`/custom-api/${encodeURIComponent(raw)}/openai-chat/v1`));
  assert.equal(new URL(url).pathname, `/custom-api/${encodeURIComponent(raw)}/openai-chat/v1`);
});

test("ingress URL for codex appends /v1 for wire_api responses suffix", () => {
  const url = buildProxyIngressBaseUrl(27483, "codex", "gpt-5.4", "openai-responses");
  assert.equal(url, "http://127.0.0.1:27483/codex/gpt-5.4/openai-responses/v1");
});

test("ingress URL preserves already-encoded %-segments via encodeURIComponent", () => {
  const rawId = "a%2Fb";
  const encSegment = `/ollama/${encodeURIComponent(rawId)}/claude`;
  const parsed = parseProxyIngressPath(`${encSegment}/v1/chat`);
  assert.equal(parsed?.providerId, "ollama");
  assert.equal(parsed?.modelId, rawId);
  assert.equal(parsed?.apiStyle, "claude");
});

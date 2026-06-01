const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildProxyStartArgs,
  buildProxyStopArgs,
  buildProxyStatusArgs,
  buildProxyHealthArgs,
} = require("./clovapi-proxy");

test("buildProxyStartArgs — argv tokens fixed", () => {
  const { args, host, port } = buildProxyStartArgs({ host: "127.0.0.1", port: 1234 });
  assert.deepEqual(args, ["proxy", "start", "--host", "127.0.0.1", "--port", "1234"]);
  assert.equal(host, "127.0.0.1");
  assert.equal(port, 1234);
});

test("buildProxyStopArgs — argv tokens fixed", () => {
  const { args, host, port } = buildProxyStopArgs({ host: "127.0.0.1", port: 1234 });
  assert.deepEqual(args, ["proxy", "stop", "--host", "127.0.0.1", "--port", "1234"]);
  assert.equal(host, "127.0.0.1");
  assert.equal(port, 1234);
});

test("buildProxyStatusArgs — includes json flag", () => {
  const { args } = buildProxyStatusArgs({ host: "127.0.0.1", port: 27483 });
  assert.deepEqual(args, ["proxy", "status", "--json", "--host", "127.0.0.1", "--port", "27483"]);
});

test("buildProxyHealthArgs — includes json flag", () => {
  const { args } = buildProxyHealthArgs({ host: "127.0.0.1", port: 27483 });
  assert.deepEqual(args, ["proxy", "health", "--json", "--host", "127.0.0.1", "--port", "27483"]);
});

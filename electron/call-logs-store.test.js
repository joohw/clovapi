const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

test("debug log readers use proxy HTTP endpoints from supplied CLI proxy config", async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/__debug/call-log")) {
      res.end(JSON.stringify({
        entries: [{ id: "call-1" }],
        apiKeyAggregates: [{ apiKey: { label: "Bearer sk...test", fingerprint: "abc123" }, count: 1 }],
        limit: 20,
        offset: 0,
        hasMore: false,
      }));
      return;
    }
    if (req.url.startsWith("/__debug/system-log")) {
      res.end(JSON.stringify({ entries: [{ id: "sys-1" }], limit: 20 }));
      return;
    }
    if (req.url.startsWith("/usage")) {
      res.end(JSON.stringify({
        ok: true,
        usages: [{ vendor: "Codex Subscription", ok: true }],
        updatedAt: "2026-07-02T07:05:46Z",
      }));
      return;
    }
    if (req.url.startsWith("/__debug/profiles")) {
      res.end(JSON.stringify({
        ok: true,
        profiles: [{ name: "Codex Subscription", usage: { ok: true } }],
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const proxy = { host: "127.0.0.1", port };

  const store = require("./call-logs-store");
  const callLogs = await store.readCallLogsViaHTTP({ limit: 20, offset: 0, proxy });
  const filteredCallLogs = await store.readCallLogsViaHTTP({ limit: 20, offset: 0, apiKey: "clovapi-test", proxy });
  const systemLogs = await store.readSystemLogsViaHTTP(20, { proxy });
  const usage = await store.readUsageViaHTTP({ refresh: true, proxy });
  const profiles = await store.readProfilesViaHTTP({ proxy });

  assert.deepEqual(callLogs.entries, [{ id: "call-1" }]);
  assert.deepEqual(callLogs.apiKeyAggregates, [{ apiKey: { label: "Bearer sk...test", fingerprint: "abc123" }, count: 1 }]);
  assert.deepEqual(filteredCallLogs.entries, [{ id: "call-1" }]);
  assert.deepEqual(systemLogs, [{ id: "sys-1" }]);
  assert.deepEqual(usage.usages, [{ vendor: "Codex Subscription", ok: true }]);
  assert.equal(usage.updatedAt, "2026-07-02T07:05:46Z");
  assert.deepEqual(profiles.profiles, [{ name: "Codex Subscription", usage: { ok: true } }]);
  assert.deepEqual(requests, [
    "/__debug/call-log?limit=20&offset=0",
    "/__debug/call-log?limit=20&offset=0&api_key=clovapi-test",
    "/__debug/system-log?limit=20",
    "/usage?refresh=1",
    "/__debug/profiles",
  ]);
});

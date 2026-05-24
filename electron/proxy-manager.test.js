const EventEmitter = require("node:events");
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createGoProxyManager,
  buildProxyServeArgs,
  normalizeBindHost,
  healthClientHost,
  reachableLoopbackHost,
  healthUrl,
  redactSecrets,
} = require("./proxy-manager");

test("buildProxyStartArgs — argv tokens fixed", () => {
  const { args, host, port } = buildProxyServeArgs({ host: "127.0.0.1", port: 1234 });
  assert.deepEqual(args, ["proxy", "start", "--host", "127.0.0.1", "--port", "1234"]);
  assert.equal(host, "127.0.0.1");
  assert.equal(port, 1234);
});

test("reachableLoopbackHost — bind-all maps to localhost health", () => {
  assert.equal(reachableLoopbackHost("0.0.0.0"), "127.0.0.1");
  assert.equal(reachableLoopbackHost("::"), "127.0.0.1");
});

test("normalizeBindHost — strips accidental URL scheme and port", () => {
  assert.equal(normalizeBindHost("http://127.0.0.1:8080"), "127.0.0.1");
  assert.equal(normalizeBindHost("[::1]:27483"), "::1");
});

test("healthUrl — brackets IPv6 loopback for fetch()", () => {
  const u = new URL(healthUrl({ host: "::1", port: 4000 }));
  assert.equal(u.hostname, "[::1]");
  assert.equal(u.port, "4000");
});

test("healthUrl — probes loopback host for [::]", () => {
  const u = new URL(healthUrl({ host: "::", port: 4000 }));
  assert.equal(u.hostname, "127.0.0.1");
});

test("healthUrl — rejects malformed host before fetch", () => {
  assert.throws(() => healthUrl({ host: "not a host", port: 4000 }), /invalid proxy health URL/);
});

test("redactSecrets masks bearer-ish tokens", () => {
  const out = redactSecrets("Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxx");
  assert.match(out, /\[redacted\]/);
});

test("start — external proxy: no spawn when /health OK", async () => {
  const mgr = createGoProxyManager({
    resolveExecutable: async () => "should-not-run",
    loadProxyConfigFn: async () => ({ host: "127.0.0.1", port: 57901 }),
    spawnFn() {
      assert.fail("spawn must not be called when proxy already serves /health");
    },
    fetchHealth: async () => ({ ok: true, body: { ok: true, service: "clovapi-core-proxy" } }),
    fetchCallLogSupport: async () => ({ ok: true, supports: true }),
  });
  const st = await mgr.start({ port: 57901 });
  assert.equal(st.ok, true);
  assert.equal(st.running, true);
  assert.equal(st.managed, false);
  assert.equal(st.external, true);
  assert.strictEqual(st.pid, null);
});

test("start — invokes spawnFn with proxy start argv", async () => {
  let sawSpawn = false;
  class FakeProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 42_001;
    killed = false;
    exitCode = null;
    signalCode = null;
    kill() {
      /* keep alive until test ends */
    }
  }

  const fakeChild = new FakeProcess();
  let tick = 0;
  const mgr = createGoProxyManager({
    resolveExecutable: async () => "/opt/bin/clovapi",
    loadProxyConfigFn: async () => ({ host: "127.0.0.1", port: 58901 }),
    healthPollMs: 1,
    healthDeadlineMs: 2000,
    fetchHealth: async () => {
      tick += 1;
      return { ok: tick >= 3, body: tick >= 3 ? { ok: true, service: "clovapi-core-proxy" } : {} };
    },
    fetchCallLogSupport: async () => ({ ok: true, supports: true }),
    spawnFn(executable, args) {
      sawSpawn = true;
      assert.equal(executable, "/opt/bin/clovapi");
      assert.deepEqual(args, ["proxy", "start", "--host", "127.0.0.1", "--port", "58901"]);
      queueMicrotask(() => {
        fakeChild.emit("close", 0, null);
      });
      return /** @type {any} */ (fakeChild);
    },
  });

  const st = await mgr.start({ port: 58901 });
  assert.ok(sawSpawn);
  assert.equal(st.ok, true);
  assert.equal(st.managed, false);
  assert.equal(st.external, true);
  assert.strictEqual(st.pid, null);
});

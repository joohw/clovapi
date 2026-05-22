const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const zlib = require("node:zlib");
const { API_STYLES, createIrRequest, collectEvents } = require("./ir");
const { getDecoder, getEncoder } = require("./registry");
const { prepareUpstreamRequest, transformResponse, readStream } = require("./pipeline");
const { joinUrl, resolveIngressContext } = require("../proxy-resolver");
const { createLocalProxyServer } = require("../local-proxy");
const providerRegistry = require("../provider-registry");
const profileStore = require("../profile-store");
const { testVendorModel } = require("../model-adapters");
const subscriptionAuth = require("../subscription-auth");
const { parseSseChunk, formatOpenAiSseData } = require("./sse");

describe("protocol registry", () => {
  it("exposes all four api styles", () => {
    for (const style of API_STYLES) {
      assert.ok(getDecoder(style));
      assert.ok(getEncoder(style));
    }
  });
});

describe("joinUrl", () => {
  it("appends /v1 for anthropic base without version", () => {
    assert.equal(joinUrl("https://api.anthropic.com", "/messages"), "https://api.anthropic.com/v1/messages");
  });

  it("keeps codex backend path without /v1 prefix", () => {
    assert.equal(
      joinUrl("https://chatgpt.com/backend-api", "/codex/responses"),
      "https://chatgpt.com/backend-api/codex/responses",
    );
  });
});

describe("proxy ingress URL", () => {
  it("does not put /v1 in generated CLI base_url", () => {
    assert.equal(
      providerRegistry.buildProxyIngressBaseUrl(27483, "claude-code", "claude-opus-4-6", "claude"),
      "http://127.0.0.1:27483/claude-code/claude-opus-4-6/claude",
    );
  });

  it("parses the client-provided /v1 request prefix once", () => {
    const parsed = providerRegistry.parseProxyIngressPath("/claude-code/claude-opus-4-6/claude/v1/messages");
    assert.equal(parsed.pathSuffix, "/messages");
  });
});

describe("request conversion matrix", () => {
  const sampleOpenAiBody = Buffer.from(
    JSON.stringify({
      model: "gpt-test",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
      max_tokens: 64,
    }),
  );

  const sampleClaudeBody = Buffer.from(
    JSON.stringify({
      model: "claude-test",
      max_tokens: 64,
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    }),
  );

  for (const ingress of API_STYLES) {
    for (const egress of API_STYLES) {
      it(`ingress ${ingress} -> egress ${egress}`, () => {
        const ingressBody = ingress === "claude" ? sampleClaudeBody : sampleOpenAiBody;
        const { upstreamBody, ir } = prepareUpstreamRequest({
          ingressStyle: ingress,
          egressStyle: egress,
          body: ingressBody,
          upstream: { model: "fallback-model" },
        });
        assert.ok(ir.model);
        assert.ok(upstreamBody.length > 0);
        const parsed = JSON.parse(upstreamBody.toString("utf8"));
        assert.ok(parsed.model);
        if (egress === "claude") assert.ok(Array.isArray(parsed.messages));
        if (egress === "openai-chat" || egress === "gemini") assert.ok(Array.isArray(parsed.messages));
        if (egress === "openai-responses") assert.ok(parsed.input);
      });
    }
  }
});

describe("subscription model binding", () => {
  it("resolves wire model from proxy path when not yet in vendor.models", () => {
    const store = profileStore.emptyStore();
    profileStore.ensureDefaultOllamaProfile(store);
    const sub = store.profiles.find((p) => p.subscription_provider_id === "claude-code");
    sub.models = [
      {
        id: "claude-sonnet-4-6",
        label: "sonnet",
        model: "claude-sonnet-4-6",
        api_style: "claude",
      },
    ];
    const origBuild = subscriptionAuth.buildSubscriptionProfile;
    subscriptionAuth.buildSubscriptionProfile = () => ({
      ok: true,
      profile: {
        api_style: "claude",
        base_url: "http://127.0.0.1:1",
        api_key: "sk-ant-oat-test-token",
      },
    });
    try {
      const ctx = resolveIngressContext("claude-code", "claude-opus-4-7", "openai-chat", store);
      assert.equal(ctx.binding, "@model:Claude Code 订阅/claude-opus-4-7");
      assert.equal(ctx.upstream.model, "claude-opus-4-7");
    } finally {
      subscriptionAuth.buildSubscriptionProfile = origBuild;
    }
  });
});

describe("subscription claude oauth encode", () => {
  it("adds Claude Code OAuth system prompt for subscription upstream", () => {
    const { enrichIrRequest } = require("./gateway");
    const { getEncoder } = require("./registry");
    const ir = enrichIrRequest(
      {
        model: "claude-opus-4-7",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      },
      { model: "claude-opus-4-7", source: "subscription:claude-code" },
    );
    const body = JSON.parse(getEncoder("claude").encodeRequest(ir).toString("utf8"));
    assert.match(body.system, /Claude Code/);
  });
});

describe("claude system prompt", () => {
  it("hoists OpenAI system role messages to top-level system when egress is claude", () => {
    const body = Buffer.from(
      JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "hello" },
        ],
        stream: false,
      }),
    );
    const { upstreamBody } = prepareUpstreamRequest({
      ingressStyle: "openai-chat",
      egressStyle: "claude",
      body,
      upstream: { model: "claude-sonnet-4-6" },
    });
    const parsed = JSON.parse(upstreamBody.toString("utf8"));
    assert.equal(parsed.system, "You are a helpful assistant.");
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].role, "user");
    assert.ok(!parsed.messages.some((m) => m.role === "system"));
  });
});

describe("openai-chat <-> claude response", () => {
  it("converts claude json message to openai chat completion", async () => {
    const claudeJson = Buffer.from(
      JSON.stringify({
        type: "message",
        role: "assistant",
        model: "claude-opus-4-7",
        content: [{ type: "text", text: "Hi there" }],
        stop_reason: "end_turn",
      }),
    );
    const events = getDecoder("claude").decodeResponseJson(claudeJson);
    const out = getEncoder("openai-chat").encodeResponseJson(events);
    const parsed = JSON.parse(out.toString("utf8"));
    assert.equal(parsed.choices[0].message.content, "Hi there");
  });

  it("converts claude sse chunks to openai sse", async () => {
    const chunks = [
      Buffer.from(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
      ),
      Buffer.from('event: message_stop\ndata: {"type":"message_stop"}\n\n'),
    ];
    async function* source() {
      for (const c of chunks) yield c;
    }
    const events = [];
    for await (const e of getDecoder("claude").decodeSseStream(source())) {
      events.push(e);
    }
    assert.ok(events.some((e) => e.type === "text_delta" && e.text === "Hi"));

    const encoded = [];
    async function* eventIter() {
      for (const e of events) yield e;
      yield { type: "finish", reason: "end_turn" };
    }
    for await (const buf of getEncoder("openai-chat").encodeSseStream(eventIter())) {
      encoded.push(buf.toString("utf8"));
    }
    const joined = encoded.join("");
    assert.match(joined, /chat\.completion\.chunk/);
    assert.match(joined, /\[DONE\]/);
  });
});

describe("resolveIngressContext", () => {
  it("allows ingress style different from model profile api_style", () => {
    const store = profileStore.emptyStore();
    profileStore.ensureDefaultOllamaProfile(store);
    const sub = store.profiles.find((p) => p.subscription_provider_id === "claude-code");
    sub.models.push({
      id: "claude-opus-4-7",
      label: "opus",
      model: "claude-opus-4-7",
      api_style: "claude",
    });
    const origBuild = subscriptionAuth.buildSubscriptionProfile;
    subscriptionAuth.buildSubscriptionProfile = () => ({
      ok: true,
      profile: {
        api_style: "claude",
        base_url: "http://127.0.0.1:1",
        api_key: "sk-ant-oat-test-token",
      },
    });
    try {
      const ctx = resolveIngressContext("claude-code", "claude-opus-4-7", "openai-chat", store);
      assert.equal(ctx.ingressStyle, "openai-chat");
      assert.equal(ctx.egressStyle, "claude");
      assert.equal(ctx.upstream.model, "claude-opus-4-7");
    } finally {
      subscriptionAuth.buildSubscriptionProfile = origBuild;
    }
  });
});

describe("codex responses -> claude sse", () => {
  it("transcodes Responses API SSE into Anthropic message stream", async () => {
    const codexChunks = [
      'event: response.created\ndata: {"type":"response.created","response":{"model":"gpt-5.4"}}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","status":"completed"}\n\n',
    ];
    async function* source() {
      for (const c of codexChunks) yield Buffer.from(c);
    }
    const events = [];
    for await (const e of getDecoder("openai-responses").decodeSseStream(source())) {
      events.push(e);
    }
    assert.ok(events.some((e) => e.type === "text_delta" && e.text.includes("你好")));

    async function* eventIter() {
      yield { type: "message_start", role: "assistant", model: "gpt-5.4" };
      for (const e of events) yield e;
    }
    const encoded = [];
    for await (const buf of getEncoder("claude").encodeSseStream(eventIter())) {
      encoded.push(buf.toString("utf8"));
    }
    const joined = encoded.join("");
    assert.match(joined, /event: message_start/);
    assert.match(joined, /"id":"msg_/);
    assert.match(joined, /content_block_delta/);
    assert.match(joined, /你好/);
    assert.match(joined, /content_block_stop/);
    assert.match(joined, /event: message_stop/);
  });
});

describe("local proxy models list", () => {
  it("returns bound model on GET /v1/models for claude ingress", async () => {
    const proxy = createLocalProxyServer({ port: 0 });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyPort = proxy.address().port;

    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: proxyPort,
          path: "/codex/gpt-5.4-test/claude/v1/models",
          method: "GET",
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        },
      );
      req.on("error", reject);
      req.end();
    });

    proxy.close();
    assert.equal(response.status, 200);
    const parsed = JSON.parse(response.body.toString("utf8"));
    assert.ok(Array.isArray(parsed.data));
    assert.equal(parsed.data[0].id, "gpt-5.4-test");
  });
});

describe("custom api model tests", () => {
  it("uses the model-level base URL and API key", async () => {
    let sawRequest = false;
    const upstreamServer = http.createServer((req, res) => {
      sawRequest = true;
      assert.equal(req.url, "/v1/responses");
      assert.equal(req.headers.authorization, "Bearer sk-test");
      let body = "";
      req.on("data", (c) => {
        body += c.toString("utf8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body);
        assert.equal(parsed.model, "gpt-5.4");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "resp_test", object: "response" }));
      });
    });
    await new Promise((resolve) => upstreamServer.listen(0, resolve));
    const upstreamPort = upstreamServer.address().port;

    try {
      const result = await testVendorModel(
        {
          name: "自定义 API",
          kind: "api",
          model_adapter: "manual",
          base_url: "",
          api_key: "",
        },
        {
          id: "gpt-5.4",
          label: "gpt-5.4",
          model: "gpt-5.4",
          api_style: "openai-responses",
          base_url: `http://127.0.0.1:${upstreamPort}`,
          api_key: "sk-test",
        },
      );

      assert.equal(result.ok, true);
      assert.equal(sawRequest, true);
    } finally {
      upstreamServer.close();
    }
  });
});

describe("local proxy integration", () => {
  it("converts openai-chat ingress to claude upstream on mock server", async () => {
    const store = profileStore.emptyStore();
    profileStore.ensureDefaultOllamaProfile(store);
    const sub = store.profiles.find((p) => p.subscription_provider_id === "claude-code");
    sub.models.push({
      id: "claude-opus-4-7",
      label: "opus",
      model: "claude-opus-4-7",
      api_style: "claude",
    });

    const origLoadStore = profileStore.loadStore;
    profileStore.loadStore = async () => store;

    const upstreamServer = http.createServer((req, res) => {
      assert.equal(req.url, "/v1/messages");
      let body = "";
      req.on("data", (c) => {
        body += c.toString("utf8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body);
        assert.equal(parsed.model, "claude-opus-4-7");
        assert.equal(parsed.messages[0].content, "ping");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            type: "message",
            role: "assistant",
            model: "claude-opus-4-7",
            content: [{ type: "text", text: "pong" }],
            stop_reason: "end_turn",
          }),
        );
      });
    });

    await new Promise((resolve) => upstreamServer.listen(0, resolve));
    const upstreamPort = upstreamServer.address().port;

    const origBuild = require("../subscription-auth").buildSubscriptionProfile;
    const subscriptionAuth = require("../subscription-auth");
    subscriptionAuth.buildSubscriptionProfile = () => ({
      ok: true,
      profile: {
        api_style: "claude",
        base_url: `http://127.0.0.1:${upstreamPort}`,
        api_key: "sk-ant-oat-test-token",
        model: "claude-opus-4-7",
      },
    });

    const proxy = createLocalProxyServer({ port: 0 });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyPort = proxy.address().port;

    const payload = JSON.stringify({
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "ping" }],
      stream: false,
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: proxyPort,
          path: "/claude-code/claude-opus-4-7/openai-chat/v1/chat/completions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    subscriptionAuth.buildSubscriptionProfile = origBuild;
    profileStore.loadStore = origLoadStore;
    proxy.close();
    upstreamServer.close();

    assert.equal(response.status, 200);
    const parsed = JSON.parse(response.body.toString("utf8"));
    assert.equal(parsed.choices[0].message.content, "pong");
  });

  it("strips content-encoding when upstream returns gzip (OpenCode decompression fix)", async () => {
    const store = profileStore.emptyStore();
    profileStore.ensureDefaultOllamaProfile(store);
    const sub = store.profiles.find((p) => p.subscription_provider_id === "claude-code");
    sub.models.push({
      id: "claude-opus-4-7",
      label: "opus",
      model: "claude-opus-4-7",
      api_style: "claude",
    });

    const origLoadStore = profileStore.loadStore;
    profileStore.loadStore = async () => store;

    const claudeJson = JSON.stringify({
      type: "message",
      role: "assistant",
      model: "claude-opus-4-7",
      content: [{ type: "text", text: "pong" }],
      stop_reason: "end_turn",
    });
    const gzipBody = zlib.gzipSync(Buffer.from(claudeJson, "utf8"));

    const upstreamServer = http.createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(gzipBody.length),
      });
      res.end(gzipBody);
    });

    await new Promise((resolve) => upstreamServer.listen(0, resolve));
    const upstreamPort = upstreamServer.address().port;

    const origBuild = require("../subscription-auth").buildSubscriptionProfile;
    const subscriptionAuth = require("../subscription-auth");
    subscriptionAuth.buildSubscriptionProfile = () => ({
      ok: true,
      profile: {
        api_style: "claude",
        base_url: `http://127.0.0.1:${upstreamPort}`,
        api_key: "sk-ant-oat-test-token",
        model: "claude-opus-4-7",
      },
    });

    const proxy = createLocalProxyServer({ port: 0 });
    await new Promise((resolve) => proxy.listen(0, resolve));
    const proxyPort = proxy.address().port;

    const payload = JSON.stringify({
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "ping" }],
      stream: false,
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: proxyPort,
          path: "/claude-code/claude-opus-4-7/openai-chat/v1/chat/completions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "Accept-Encoding": "gzip",
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    subscriptionAuth.buildSubscriptionProfile = origBuild;
    profileStore.loadStore = origLoadStore;
    proxy.close();
    upstreamServer.close();

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], undefined);
    assert.notEqual(response.body[0], 0x1f);
    const parsed = JSON.parse(response.body.toString("utf8"));
    assert.equal(parsed.choices[0].message.content, "pong");
  });
});

describe("sse parser", () => {
  it("parses multiline data events", () => {
    const state = { buffer: "" };
    const records = parseSseChunk("data: {\"a\":1}\n\n", state);
    assert.equal(records.length, 1);
    assert.equal(records[0].data, "{\"a\":1}");
  });
});

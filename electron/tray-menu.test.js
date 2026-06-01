const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildTrayMenuModel,
  installedByKindFromAgents,
  isValidTrayTab,
  resolveTrayAgentBindings,
  trayStatusSummary,
  trayTooltip,
} = require("./tray-menu");

const SAMPLE_AGENTS = [
  { kind: "claude-code", installed: true },
  { kind: "codex", installed: false },
  { kind: "hermes", installed: true },
];

test("isValidTrayTab accepts known desktop tabs", () => {
  assert.equal(isValidTrayTab("profiles"), true);
  assert.equal(isValidTrayTab("settings"), true);
  assert.equal(isValidTrayTab("call-logs"), true);
  assert.equal(isValidTrayTab("unknown"), false);
});

test("trayStatusSummary describes running managed proxy", () => {
  assert.equal(trayStatusSummary({ running: true, managed: true, port: 27483 }), "Proxy running on :27483 (managed)");
});

test("trayStatusSummary preserves stopped error detail", () => {
  assert.equal(trayStatusSummary({ running: false, port: 3000, error: "health failed" }), "Proxy stopped · health failed");
});

test("trayTooltip prefixes app name", () => {
  assert.equal(trayTooltip("Proxy running on :27483 (managed)"), "ClovAPI Switcher — Proxy running on :27483 (managed)");
});

test("installedByKindFromAgents maps desktop agent status items", () => {
  assert.deepEqual(installedByKindFromAgents(SAMPLE_AGENTS), {
    "claude-code": true,
    codex: false,
    hermes: true,
  });
});

test("resolveTrayAgentBindings only includes installed agents", () => {
  const bindings = resolveTrayAgentBindings(
    {
      profiles: [
        {
          name: "Custom API",
          kind: "api",
          models: [{ id: "gpt-4.1", label: "GPT-4.1", model: "gpt-4.1", apiStyle: "openai-responses" }],
        },
        {
          name: "Claude Subscription",
          kind: "subscription",
          subscriptionProviderId: "claude-code",
          models: [{ id: "default", label: "Default", model: "default", apiStyle: "claude" }],
        },
      ],
      active: {
        hermes: { provider_id: "custom-api", model_id: "gpt-4.1" },
        "claude-code": { provider_id: "claude-code", model_id: "default" },
        codex: { provider_id: "custom-api", model_id: "gpt-4.1" },
      },
    },
    installedByKindFromAgents(SAMPLE_AGENTS),
  );

  assert.deepEqual(
    bindings.map((item) => item.cliKind),
    ["claude-code", "hermes"],
  );
  assert.deepEqual(bindings[0], {
    cliKind: "claude-code",
    cliLabel: "Claude Code",
    installed: true,
    providerId: "claude-code",
    vendorName: "Claude Subscription",
    modelId: "default",
    modelLabel: "Default",
    summaryLabel: "Claude Code · Default",
    detailLabel: "Claude Subscription / Default",
    modelOptions: [
      {
        providerId: "custom-api",
        modelId: "gpt-4.1",
        label: "Custom API / GPT-4.1",
        checked: false,
      },
      {
        providerId: "claude-code",
        modelId: "default",
        label: "Claude Subscription / Default",
        checked: true,
      },
    ],
  });
  assert.deepEqual(bindings[1].summaryLabel, "Hermes · GPT-4.1");
});

test("resolveTrayAgentBindings includes installed agents without active selection", () => {
  const bindings = resolveTrayAgentBindings(
    {
      profiles: [
        {
          name: "Custom API",
          kind: "api",
          models: [{ id: "gpt-4.1", label: "GPT-4.1", model: "gpt-4.1", apiStyle: "openai-responses" }],
        },
      ],
      active: {},
    },
    { opencode: true },
  );

  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].cliKind, "opencode");
  assert.equal(bindings[0].summaryLabel, "OpenCode");
  assert.equal(bindings[0].detailLabel, "No model selected");
});

test("buildTrayMenuModel exposes safe proxy actions and installed agents", () => {
  const running = buildTrayMenuModel({
    running: true,
    managed: true,
    port: 27483,
    profiles: [
      {
        name: "Custom API",
        kind: "api",
        models: [{ id: "gpt-4.1", label: "GPT-4.1", model: "gpt-4.1", apiStyle: "openai-responses" }],
      },
    ],
    active: { hermes: { provider_id: "custom-api", model_id: "gpt-4.1" } },
    agents: [{ kind: "hermes", installed: true }],
  });
  assert.equal(running.windowLabel, "Show ClovAPI Switcher");
  assert.equal(running.canStartProxy, false);
  assert.equal(running.startProxyLabel, "Start Proxy on :27483");
  assert.match(running.statusLabel, /Proxy running/);
  assert.equal(running.hasBindings, true);
  assert.equal(running.noAgentsLabel, "No installed agents");
  assert.equal(running.bindings[0].summaryLabel, "Hermes · GPT-4.1");
  assert.deepEqual(running.bindings[0].modelOptions, [
    {
      providerId: "custom-api",
      modelId: "gpt-4.1",
      label: "Custom API / GPT-4.1",
      checked: true,
    },
  ]);
  assert.equal("canStopProxy" in running, false);

  const stopped = buildTrayMenuModel({ running: false, port: 3000, agents: [] });
  assert.equal(stopped.windowLabel, "Show ClovAPI Switcher");
  assert.equal(stopped.canStartProxy, true);
  assert.equal(stopped.startProxyLabel, "Start Proxy on :3000");
  assert.equal(stopped.hasBindings, false);
});

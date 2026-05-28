const assert = require("node:assert/strict");
const test = require("node:test");
const { applyTrayModelSwitch } = require("./tray-model-switch");

test("applyTrayModelSwitch delegates tray selections to clovapi switch", async () => {
  const calls = [];
  const result = await applyTrayModelSwitch({
    desktop: {
      async switchProviderModel(cliKind, providerId, modelId) {
        calls.push({ cliKind, providerId, modelId });
        return { ok: true };
      },
      async saveProfiles() {
        throw new Error("tray switch must not save profiles directly");
      },
    },
    cliKind: "codex",
    providerId: "custom-api",
    modelId: "gpt-5.5",
    dispatchRendererEvent(payload) {
      calls.push({ event: payload });
    },
    async updateTrayMenu() {
      calls.push({ updateTrayMenu: true });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { cliKind: "codex", providerId: "custom-api", modelId: "gpt-5.5" },
    { event: { type: "profiles-changed" } },
    { updateTrayMenu: true },
  ]);
});

test("applyTrayModelSwitch reports switch failures without profile change events", async () => {
  const errors = [];
  const events = [];
  const result = await applyTrayModelSwitch({
    desktop: {
      async switchProviderModel() {
        return { ok: false, error: "write failed" };
      },
    },
    cliKind: "hermes",
    providerId: "custom-api",
    modelId: "claude-sonnet",
    emitOutput(stream, message) {
      errors.push({ stream, message });
    },
    dispatchRendererEvent(payload) {
      events.push(payload);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "write failed");
  assert.deepEqual(events, []);
  assert.deepEqual(errors, [{ stream: "stderr", message: "[tray] failed to switch hermes model: write failed\n" }]);
});

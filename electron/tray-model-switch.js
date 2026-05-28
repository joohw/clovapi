async function applyTrayModelSwitch(options = {}) {
  const desktop = options.desktop;
  const emitOutput = typeof options.emitOutput === "function" ? options.emitOutput : () => {};
  const dispatchRendererEvent =
    typeof options.dispatchRendererEvent === "function" ? options.dispatchRendererEvent : () => {};
  const updateTrayMenu = typeof options.updateTrayMenu === "function" ? options.updateTrayMenu : async () => {};

  const kind = String(options.cliKind || "").trim();
  const provider = String(options.providerId || "").trim();
  const model = String(options.modelId || "").trim();
  if (!kind || !provider || !model) return { ok: false, skipped: true };
  if (!desktop || typeof desktop.switchProviderModel !== "function") {
    emitOutput("stderr", `[tray] failed to switch ${kind} model: clovapi switch is unavailable\n`);
    return { ok: false, error: "clovapi switch is unavailable" };
  }

  const result = await desktop.switchProviderModel(kind, provider, model);
  if (!result?.ok) {
    const error = String(result?.error || "unknown error").trim() || "unknown error";
    emitOutput("stderr", `[tray] failed to switch ${kind} model: ${error}\n`);
    await updateTrayMenu();
    return { ok: false, error };
  }

  dispatchRendererEvent({ type: "profiles-changed" });
  await updateTrayMenu();
  return { ok: true };
}

module.exports = {
  applyTrayModelSwitch,
};

import {
  canApplyCliBinding,
  activeSelection,
  isSubscriptionBinding,
  subscriptionProviderFromBinding,
  subscriptionProviderLabel,
} from "../helpers";
import { t } from "../i18n";
import { persistProfiles } from "./profiles";
import { refreshProxyLogs, refreshProxyStatus } from "./proxy";
import { subscriptionStatusForProvider } from "./subscriptions";
import { activeBindingForCli, isValidModelBinding } from "./bindings";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { CliDef } from "../../global";

export { activeBindingForCli };

function installedCli(cli: CliDef): boolean {
  return Boolean(store.cliDetectedPath[cli.id]);
}

export function setRunning(running: boolean) {
  store.running = running;
}

export async function onCliBindingChange(cli: CliDef, value: string) {
  const binding = String(value || "").trim();
  if (!binding) delete store.active[cli.kind];
  else {
    const [providerId, modelId] = binding.split("/", 2);
    store.active[cli.kind] = activeSelection(providerId, modelId);
  }
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || t("toast.bindingSaveFailed"));
  }
}

export async function detectCliPath() {
  const bridge = window.clovapiCli;
  if (!bridge?.agentStatus) return;

  const next: Record<string, string> = {};
  const nextInstallSupported: Record<string, boolean> = {};
  const nextUninstallSupported: Record<string, boolean> = {};
  const nextInstallPlan: Record<string, string> = {};
  for (const cli of store.clis) {
    next[cli.id] = "";
    nextInstallSupported[cli.id] = false;
    nextUninstallSupported[cli.id] = false;
    nextInstallPlan[cli.id] = "";
  }

  try {
    const result = await bridge.agentStatus();
    if (result?.ok && Array.isArray(result.items)) {
      for (const item of result.items) {
        const id = String(item?.id || "").trim();
        if (!id) continue;
        nextInstallSupported[id] = Boolean(item?.installSupported);
        nextUninstallSupported[id] = Boolean(item?.uninstallSupported);
        nextInstallPlan[id] = String(item?.installPlan || "").trim();
        if (!item?.installed) continue;
        next[id] = String(item?.commandPath || "").trim() || "available";
      }
    }
  } catch {
    /* leave defaults empty; CLI owns detection */
  }
  store.cliDetectedPath = next;
  store.cliInstallSupported = nextInstallSupported;
  store.cliUninstallSupported = nextUninstallSupported;
  store.cliInstallPlan = nextInstallPlan;
}

export async function detectOllamaInstalled() {
  const bridge = window.clovapiCli;
  if (!bridge?.which) return;
  try {
    const result = await bridge.which("ollama");
    store.ollamaInstalled = Boolean(result?.exists);
  } catch {
    store.ollamaInstalled = false;
  }
}

async function runClovapiArgsAndWait(args: string[], options?: { silent?: boolean }) {
  const bridge = window.clovapiCli;
  if (!bridge?.runClovapi) {
    if (!options?.silent) toast.error(t("toast.clovapiUnavailable"));
    return { ok: false };
  }

  setRunning(true);
  try {
    const cwdRes = await bridge.defaultCwd().catch(() => ({ cwd: "" }));
    const result = await bridge.runClovapi(args, cwdRes.cwd || "");
    if (!result?.ok) {
      if (!options?.silent) toast.error(result?.error || t("toast.clovapiStartFailed"));
      return { ok: false, code: result?.code, error: result?.error };
    }
    const code = result.code;
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    const ok = code === 0 || code === null || code === undefined;
    return { ok, code, stderr, stdout, error: ok ? "" : stderr || stdout };
  } finally {
    setRunning(false);
  }
}


export async function runCliInstall(cli: CliDef) {
  const bridge = window.clovapiCli;
  if (!bridge?.agentInstall) {
    toast.error(t("toast.clovapiUnavailable"));
    return;
  }
  if (store.running || store.cliLifecycleBusy[cli.id]) {
    toast.info(t("toast.commandRunning"));
    return;
  }
  const toastId = `cli-install-${cli.id}`;
  store.cliLifecycleBusy[cli.id] = true;
  toast.loading(t("toast.installingAgent", { name: cli.name }), { id: toastId });
  try {
    const result = await bridge.agentInstall(cli.kind);
    await detectCliPath();
    if (!result?.ok) {
      toast.error(result?.error || t("toast.agentInstallFailed", { name: cli.name }), { id: toastId });
      return;
    }
    toast.success(t("toast.agentInstallSuccess", { name: cli.name }), { id: toastId });
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.agentInstallFailed", { name: cli.name });
    toast.error(message, { id: toastId });
  } finally {
    store.cliLifecycleBusy[cli.id] = false;
  }
}

export async function runCliUninstall(cli: CliDef) {
  const bridge = window.clovapiCli;
  if (!bridge?.agentUninstall) {
    toast.error(t("toast.clovapiUnavailable"));
    return;
  }
  if (store.running || store.cliLifecycleBusy[cli.id]) {
    toast.info(t("toast.commandRunning"));
    return;
  }
  const toastId = `cli-uninstall-${cli.id}`;
  store.cliLifecycleBusy[cli.id] = true;
  toast.loading(t("toast.uninstallingAgent", { name: cli.name }), { id: toastId });
  try {
    const result = await bridge.agentUninstall(cli.kind);
    await detectCliPath();
    if (!result?.ok) {
      toast.error(result?.error || t("toast.agentUninstallFailed", { name: cli.name }), { id: toastId });
      return;
    }
    toast.success(t("toast.agentUninstallSuccess", { name: cli.name }), { id: toastId });
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.agentUninstallFailed", { name: cli.name });
    toast.error(message, { id: toastId });
  } finally {
    store.cliLifecycleBusy[cli.id] = false;
  }
}
export async function runCliApply(cli: CliDef) {
  let binding = activeBindingForCli(cli.kind);

  if (!store.clovapiAvailable) {
    toast.error(t("toast.clovapiMissing"));
    return;
  }

  if (!installedCli(cli)) {
    toast.error(t("toast.cliNotInstalled", { name: cli.name }));
    return;
  }

  if (store.running) {
    toast.info(t("toast.commandRunning"));
    return;
  }

  const toastId = `cli-apply-${cli.id}`;
  await refreshProxyStatus();

  if (!binding) {
    toast.loading(t("toast.applying", { name: cli.name }), { id: toastId });
    try {
      const exit = await runClovapiArgsAndWait(["switch", "--cli", cli.kind, "--reset"], {
        silent: true,
      });
      if (!exit?.ok) {
        const exitCode = exit && "code" in exit ? exit.code : undefined;
        const bridgeError = exit && "error" in exit ? String(exit.error || "").trim() : "";
        const stderr = exit && "stderr" in exit ? String(exit.stderr || "").trim() : "";
        toast.error(
          bridgeError ||
            stderr ||
            (exitCode != null
              ? t("toast.cliWriteFailed", { name: cli.name, code: String(exitCode) })
              : t("toast.cliWriteFailedGeneric")),
          { id: toastId },
        );
        return;
      }
      delete store.active[cli.kind];
      const saved = await persistProfiles();
      if (!saved?.ok) {
        toast.error(saved?.error || t("toast.profilesSaveFailed"), { id: toastId });
        return;
      }
      toast.success(t("toast.resetSuccess"), { id: toastId });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("toast.cliWriteFailedGeneric");
      toast.error(message, { id: toastId });
    } finally {
      void refreshProxyLogs();
    }
    return;
  }

  if (isSubscriptionBinding(binding, store.profiles)) {
    const providerId = subscriptionProviderFromBinding(binding, store.profiles);
    const sub = subscriptionStatusForProvider(providerId);
    if (!sub?.loggedIn) {
      toast.warning(t("toast.loginInProfiles", { vendor: subscriptionProviderLabel(providerId) }));
      return;
    }
  }

  if (!isValidModelBinding(binding)) {
    if (binding.startsWith("__local_proxy_")) {
      toast.error(t("toast.bindingStale"));
    } else if (binding) {
      toast.error(t("toast.bindingInvalid", { binding }));
    } else {
      toast.error(t("toast.selectBinding"));
    }
    delete store.active[cli.kind];
    await persistProfiles();
    return;
  }

  {
    const [providerId, modelId] = binding.split("/", 2);
    store.active[cli.kind] = activeSelection(providerId, modelId);
  }
  const primed = await persistProfiles();
  if (!primed?.ok) {
    toast.error(primed?.error || t("toast.bindingSaveFailed"));
    return;
  }
  binding = activeBindingForCli(cli.kind);
  if (!binding || !isValidModelBinding(binding)) {
    toast.error(t("toast.bindingInvalidGeneric"));
    return;
  }

  toast.loading(t("toast.applying", { name: cli.name }), { id: toastId });

  try {
    const exit = await runClovapiArgsAndWait(
      ["switch", "--cli", cli.kind, "--provider", binding.split("/")[0] || "", "--model", binding.split("/")[1] || ""],
      { silent: true },
    );

    if (!exit?.ok) {
      const exitCode = exit && "code" in exit ? exit.code : undefined;
      const bridgeError = exit && "error" in exit ? String(exit.error || "").trim() : "";
      const stderr = exit && "stderr" in exit ? String(exit.stderr || "").trim() : "";
      toast.error(
        bridgeError ||
          stderr ||
          (exitCode != null
            ? t("toast.cliWriteFailed", { name: cli.name, code: String(exitCode) })
            : t("toast.cliWriteFailedGeneric")),
        { id: toastId },
      );
      return;
    }

    {
      const [providerId, modelId] = binding.split("/", 2);
      store.active[cli.kind] = activeSelection(providerId, modelId);
    }
    const saved = await persistProfiles();
    if (!saved?.ok) {
      toast.error(saved?.error || t("toast.profilesSaveFailed"), { id: toastId });
      return;
    }
    toast.success(t("toast.applySuccess"), { id: toastId });
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.cliWriteFailedGeneric");
    toast.error(message, { id: toastId });
  } finally {
    void refreshProxyLogs();
  }
}

export function cliApplyTitle(cli: CliDef): string {
  const binding = activeBindingForCli(cli.kind);
  if (!store.clovapiAvailable) return t("cliApply.needClovapi");
  if (!String(binding || "").trim()) return t("cliApply.resetReady");
  if (!store.proxyRunning) return t("cliApply.proxyAutoStart");
  if (
    isSubscriptionBinding(binding, store.profiles) &&
    !canApplyCliBinding(binding, store.clovapiAvailable, store.subscriptions, store.profiles)
  ) {
    return t("cliApply.needSubscriptionLogin");
  }
  return t("cliApply.ready");
}

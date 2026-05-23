import {
  canApplyCliBinding,
  isSubscriptionBinding,
  subscriptionProviderFromBinding,
  subscriptionProviderLabel,
} from "../helpers";
import { persistProfiles } from "./profiles";
import { refreshProxyStatus } from "./proxy";
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
  else store.active[cli.kind] = binding;
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "保存绑定失败");
  }
}

export async function detectCliPath() {
  const bridge = window.clovapiCli;
  if (!bridge?.which) return;
  const next: Record<string, string> = {};
  for (const cli of store.clis) {
    try {
      const result = await bridge.which(cli.command);
      next[cli.id] = result?.exists ? result.path || "available" : "";
    } catch {
      next[cli.id] = "";
    }
  }
  store.cliDetectedPath = next;
}

async function runClovapiArgsAndWait(args: string[]) {
  const bridge = window.clovapiCli;
  if (!bridge?.runClovapi) {
    toast.error("当前环境无法调用 clovapi");
    return { ok: false };
  }

  setRunning(true);
  try {
    const cwdRes = await bridge.defaultCwd().catch(() => ({ cwd: "" }));
    const result = await bridge.runClovapi(args, cwdRes.cwd || "");
    if (!result?.ok) {
      toast.error(result?.error || "clovapi 启动失败");
      return { ok: false, code: result?.code };
    }
    const code = result.code;
    return { ok: code === 0 || code === null || code === undefined, code };
  } finally {
    setRunning(false);
  }
}

export async function runCliApply(cli: CliDef) {
  let binding = activeBindingForCli(cli.kind);

  if (!store.clovapiAvailable) {
    toast.error("未找到 clovapi CLI，请先构建 switcher/clovapi 或安装到 PATH");
    return;
  }

  if (!installedCli(cli)) {
    toast.error(`${cli.name} 未安装，无法应用`);
    return;
  }

  if (store.running) {
    toast.info("上一条命令仍在执行，请稍候");
    return;
  }

  if (!binding) {
    toast.error("请先选择模型方案。");
    return;
  }

  toast.info(`正在应用 ${cli.name}…`);

  if (isSubscriptionBinding(binding, store.profiles)) {
    const providerId = subscriptionProviderFromBinding(binding, store.profiles);
    const sub = subscriptionStatusForProvider(providerId);
    if (!sub?.loggedIn) {
      toast.warning(`请先在 API 管理 → ${subscriptionProviderLabel(providerId)} 中完成登录。`);
      return;
    }
  }

  if (!isValidModelBinding(binding)) {
    if (binding.startsWith("__local_proxy_")) {
      toast.error("当前绑定已失效，请重新在下拉框选择模型方案后再点「应用」。");
    } else if (binding) {
      toast.error(`无效或已删除的方案「${binding}」，请重新选择。`);
    } else {
      toast.error("请先选择模型方案。");
    }
    delete store.active[cli.kind];
    await persistProfiles();
    return;
  }

  store.active[cli.kind] = binding;
  const primed = await persistProfiles();
  if (!primed?.ok) {
    toast.error(primed?.error || "保存绑定失败");
    return;
  }
  binding = activeBindingForCli(cli.kind);
  if (!binding || !isValidModelBinding(binding)) {
    toast.error("所选模型绑定无效或已失效，请重新选择后再应用。");
    return;
  }

  const proxyBridge = window.clovapiProxy;
  if (!proxyBridge) {
    toast.error("桌面代理接口不可用，请重启应用。");
    return;
  }

  await refreshProxyStatus();

  let exit: { ok?: boolean; code?: number | null } | null = null;

  const useDirectApply = cli.kind === "opencode" || cli.kind === "kimi-code";
  if (useDirectApply) {
    if (!proxyBridge.buildIngress) {
      toast.error("请重启桌面应用以加载最新代理接口。");
      return;
    }
    const ingress = await proxyBridge.buildIngress(cli.kind, binding);
    if (!ingress?.ok || !ingress.baseUrl || !ingress.model) {
      toast.error(ingress?.error || "启动本地代理或解析模型失败");
      return;
    }
    exit = await runClovapiArgsAndWait([
      "switch",
      "--cli",
      cli.kind,
      "--base-url",
      ingress.baseUrl,
      "--model",
      ingress.model,
      "--api-key",
      "clovapi-local",
      "--api-style",
      ingress.apiStyle || (cli.kind === "kimi-code" ? "claude" : "openai-chat"),
    ]);
  } else {
    if (!proxyBridge.ensureStub) {
      toast.error("桌面代理接口不可用，请重启应用。");
      return;
    }
    const stubResult = await proxyBridge.ensureStub(cli.kind, binding);
    if (!stubResult?.ok || !stubResult.stubName) {
      toast.error(stubResult?.error || "启动本地代理或生成代理配置失败");
      return;
    }
    exit = await runClovapiArgsAndWait(["switch", "--cli", cli.kind, stubResult.stubName]);
  }

  if (!exit?.ok) {
    const exitCode = exit && "code" in exit ? exit.code : undefined;
    toast.error(
      exitCode != null
        ? `写入 ${cli.name} 配置失败（clovapi 退出码 ${exitCode}）`
        : "写入 CLI 配置失败",
    );
    return;
  }

  store.active[cli.kind] = binding;
  const saved = await persistProfiles();
  if (!saved?.ok) {
    toast.error(saved?.error || "保存 profiles.json 失败");
    return;
  }
  toast.success("应用成功");
}

export function cliApplyTitle(cli: CliDef): string {
  const binding = activeBindingForCli(cli.kind);
  if (!store.clovapiAvailable) return "需要安装 clovapi CLI";
  if (!String(binding || "").trim()) return "请先选择模型方案";
  if (!store.proxyRunning) return "本地代理未运行，应用时将自动启动";
  if (
    isSubscriptionBinding(binding, store.profiles) &&
    !canApplyCliBinding(binding, store.clovapiAvailable, store.subscriptions, store.profiles)
  ) {
    return "请先在 API 管理完成订阅供应商登录";
  }
  return "通过本地代理应用绑定";
}

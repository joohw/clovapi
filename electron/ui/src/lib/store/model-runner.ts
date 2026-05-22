import { formatTestBody, modelTestStatusKey, toIpcPayload } from "../helpers";
import { isModelTesting, setModelTestResult, setModelTestTesting } from "./model-tests";
import { store } from "./state.svelte";
import { toast } from "../toast";

export async function runModelTest(binding: string) {
  const key = String(binding || "").trim();
  if (!key) return;

  const bridge = window.clovapiProfiles;
  if (!bridge?.test) {
    toast.error("当前环境不支持 API 测试");
    return;
  }

  const statusKey = modelTestStatusKey(key);
  if (isModelTesting(statusKey)) return;

  setModelTestTesting(statusKey);

  const TEST_UI_TIMEOUT_MS = 130_000;
  let result: Awaited<ReturnType<NonNullable<typeof bridge.test>>>;
  try {
    result = await Promise.race([
      bridge.test(
        toIpcPayload({
          binding: key,
          vendors: store.profiles,
          active: store.active,
          proxy: { enabled: true, host: "127.0.0.1", port: store.proxyPort },
        }),
      ),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`测试超时（\${TEST_UI_TIMEOUT_MS / 1000}s 无响应）`)),
          TEST_UI_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "API 测试失败";
    setModelTestResult(statusKey, false, "测试失败", message);
    return;
  }

  const detail = formatTestBody(result);
  const passed = Boolean(result?.passed);
  const summary = result?.summary || (passed ? "测试成功" : "测试失败");

  setModelTestResult(statusKey, passed, summary, detail);
}

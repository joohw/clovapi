import { activeModelId, activeProviderId, modelTestStatusKey, toIpcPayload } from "../helpers";
import { t } from "../i18n";
import { isModelTesting, setModelTestResult, setModelTestTesting } from "./model-tests";
import { refreshProxyLogs } from "./proxy";
import { store } from "./state.svelte";
import { toast } from "../toast";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runModelTest(binding: string) {
  const key = String(binding || "").trim();
  if (!key) return;

  const bridge = window.clovapiCli;
  if (!bridge?.profilesTest) {
    toast.error(t("toast.apiTestUnsupported"));
    return;
  }

  const statusKey = modelTestStatusKey(key);
  if (isModelTesting(statusKey)) return;

  setModelTestTesting(statusKey);

  const TEST_UI_TIMEOUT_MS = 130_000;
  let result: Awaited<ReturnType<NonNullable<typeof bridge.profilesTest>>>;
  try {
    result = await Promise.race([
      bridge.profilesTest(
        toIpcPayload({
          provider: activeProviderId(key),
          model: activeModelId(key),
          vendors: store.profiles,
          proxy: { enabled: true, host: store.proxyHost || "127.0.0.1", port: store.proxyPort },
        }),
      ),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(t("modelTest.timeout", { seconds: TEST_UI_TIMEOUT_MS / 1000 })),
            ),
          TEST_UI_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : t("toast.apiTestFailed");
    setModelTestResult(statusKey, false, message, "");
    return;
  }

  const passed = Boolean(result?.passed);
  const summary = result?.summary || (passed ? t("modelTest.success") : t("modelTest.failed"));

  setModelTestResult(statusKey, passed, summary, "");
  await delay(150);
  await refreshProxyLogs();
}

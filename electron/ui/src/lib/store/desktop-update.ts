import { isElectronDev } from "../constants";
import { t } from "../i18n";
import { toast } from "../toast";
import { store } from "./state.svelte";

type DesktopUpdateDetail = {
  current_version?: string;
  latest_version?: string;
  up_to_date?: boolean;
};

type CheckAppUpdateOptions = {
  silent?: boolean;
};

const APP_UPDATE_CHECK_INTERVAL_MS = 600_000;

let appUpdateTimer: ReturnType<typeof setInterval> | null = null;

function applyAppUpdateDetail(detail: DesktopUpdateDetail, silent: boolean) {
  if (detail.up_to_date) {
    store.appUpdateAvailable = false;
    store.appLatestVersion = "";
    if (!silent) {
      store.appUpdateCheck = {
        status: "pass",
        summary: t("proxy.updateUpToDate"),
        detail: "",
        testedAt: Date.now(),
      };
    }
    return;
  }

  store.appUpdateAvailable = true;
  store.appLatestVersion = detail.latest_version || "";
  if (!silent) {
    store.appUpdateCheck = {
      status: "pass",
      summary: t("proxy.updateAvailable", { latest: detail.latest_version || "?" }),
      detail: "",
      testedAt: Date.now(),
    };
  }
}

export async function checkAppUpdate(options: CheckAppUpdateOptions = {}) {
  const silent = options.silent === true;
  if (isElectronDev()) return;
  if (store.appUpdating) return;
  if (!silent && store.appUpdateCheck?.status === "testing") return;

  const bridge = window.clovapiDesktop;
  if (!bridge?.checkUpdate) {
    if (!silent) {
      toast.error(t("toast.appUpdateUnsupported"));
    }
    return;
  }

  if (!silent) {
    store.appUpdateCheck = {
      status: "testing",
      summary: t("common.testing"),
      detail: "",
    };
  }

  try {
    const result = await bridge.checkUpdate();
    const detail = (result?.detail || {}) as DesktopUpdateDetail;

    if (!result?.ok) {
      store.appUpdateAvailable = false;
      store.appLatestVersion = "";
      if (!silent) {
        store.appUpdateCheck = {
          status: "fail",
          summary: result?.error || t("toast.appUpdateCheckFailed"),
          detail: "",
        };
      }
      return;
    }

    applyAppUpdateDetail(detail, silent);
  } catch (error) {
    store.appUpdateAvailable = false;
    store.appLatestVersion = "";
    if (!silent) {
      store.appUpdateCheck = {
        status: "fail",
        summary: error instanceof Error ? error.message : t("toast.appUpdateCheckFailed"),
        detail: "",
      };
    }
  }
}

export function startAppUpdatePolling() {
  if (isElectronDev()) return;
  if (appUpdateTimer) {
    clearInterval(appUpdateTimer);
    appUpdateTimer = null;
  }

  void checkAppUpdate({ silent: true });
  appUpdateTimer = setInterval(() => {
    void checkAppUpdate({ silent: true });
  }, APP_UPDATE_CHECK_INTERVAL_MS);
}

export async function installAppUpdate() {
  if (isElectronDev()) return;
  if (store.appUpdating || store.appUpdateCheck?.status === "testing") return;

  const bridge = window.clovapiDesktop;
  if (!bridge?.installUpdate) {
    toast.error(t("toast.appUpdateUnsupported"));
    return;
  }

  store.appUpdating = true;
  store.appUpdateCheck = {
    status: "testing",
    summary: t("proxy.appDownloading"),
    detail: "",
  };

  try {
    const result = await bridge.installUpdate();
    if (!result?.ok) {
      store.appUpdateCheck = {
        status: "fail",
        summary: result?.error || t("toast.appUpdateInstallFailed"),
        detail: "",
      };
      toast.error(result?.error || t("toast.appUpdateInstallFailed"));
      return;
    }

    store.appUpdateCheck = {
      status: "pass",
      summary: t("proxy.appInstallLaunching"),
      detail: "",
      testedAt: Date.now(),
    };
    toast.success(t("toast.appUpdateLaunching"));
  } catch (error) {
    store.appUpdateCheck = {
      status: "fail",
      summary: error instanceof Error ? error.message : t("toast.appUpdateInstallFailed"),
      detail: "",
    };
    toast.error(error instanceof Error ? error.message : t("toast.appUpdateInstallFailed"));
  } finally {
    store.appUpdating = false;
  }
}

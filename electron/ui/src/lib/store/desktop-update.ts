import { isElectronDev } from "../constants";
import { t } from "../i18n";
import { toast } from "../toast";
import { store } from "./state.svelte";

type DesktopUpdateDetail = {
  current_version?: string;
  latest_version?: string;
  up_to_date?: boolean;
};

export async function checkAppUpdate() {
  if (isElectronDev()) return;
  if (store.appUpdateCheck?.status === "testing" || store.appUpdating) return;

  const bridge = window.clovapiDesktop;
  if (!bridge?.checkUpdate) {
    toast.error(t("toast.appUpdateUnsupported"));
    return;
  }

  store.appUpdateCheck = {
    status: "testing",
    summary: t("common.testing"),
    detail: "",
  };

  try {
    const result = await bridge.checkUpdate();
    const detail = (result?.detail || {}) as DesktopUpdateDetail;

    if (!result?.ok) {
      store.appUpdateAvailable = false;
      store.appLatestVersion = "";
      store.appUpdateCheck = {
        status: "fail",
        summary: result?.error || t("toast.appUpdateCheckFailed"),
        detail: "",
      };
      return;
    }

    if (detail.up_to_date) {
      store.appUpdateAvailable = false;
      store.appLatestVersion = "";
      store.appUpdateCheck = {
        status: "pass",
        summary: t("proxy.updateUpToDate"),
        detail: "",
        testedAt: Date.now(),
      };
      return;
    }

    store.appUpdateAvailable = true;
    store.appLatestVersion = detail.latest_version || "";
    store.appUpdateCheck = {
      status: "pass",
      summary: t("proxy.updateAvailable", { latest: detail.latest_version || "?" }),
      detail: "",
      testedAt: Date.now(),
    };
  } catch (error) {
    store.appUpdateAvailable = false;
    store.appLatestVersion = "";
    store.appUpdateCheck = {
      status: "fail",
      summary: error instanceof Error ? error.message : t("toast.appUpdateCheckFailed"),
      detail: "",
    };
  }
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

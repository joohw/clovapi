import { t } from "./i18n";
import { toast } from "./toast";

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text || "").trim();
  if (!value) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    /* fallback below */
  }

  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export async function copyTextWithToast(
  text: string,
  messages?: { success?: string; error?: string },
) {
  const ok = await copyTextToClipboard(text);
  if (ok) toast.success(messages?.success ?? t("toast.proxyBaseUrlCopied"));
  else toast.error(messages?.error ?? t("toast.proxyBaseUrlCopyFailed"));
}

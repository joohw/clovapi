"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast-provider";
import { resolveClientPublicSiteUrl } from "@/lib/site";
import styles from "@/app/page.module.css";

export default function SkillPage() {
  const { t } = useTranslation();
  const { showError, showSuccess } = useToast();
  const [clientOrigin, setClientOrigin] = useState("");

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  const skillUrl = useMemo(() => {
    const origin = resolveClientPublicSiteUrl(clientOrigin);
    return `${origin}/skill.md`;
  }, [clientOrigin]);

  const prompt = useMemo(() => t("skill.prompt", { url: skillUrl }), [skillUrl, t]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      showSuccess(t("skill.copied"));
    } catch {
      showError(t("skill.copyFailed"));
    }
  }

  return (
    <div className="page-wrap relative">
      <div className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("skill.title")}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{t("skill.subtitle")}</p>

        <div className={`${styles.terminalCard} mt-8 max-w-3xl`}>
          <div className={styles.terminalHeader}>
            <span className="text-xs text-muted-foreground">{t("skill.promptLabel")}</span>
            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={() => void copyPrompt()}
            >
              {t("skill.copy")}
            </button>
          </div>
          <p className="p-4 text-sm leading-relaxed text-foreground sm:p-5 sm:text-[0.95rem]">{prompt}</p>
        </div>
      </div>
    </div>
  );
}

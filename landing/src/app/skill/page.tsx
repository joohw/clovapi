"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast-provider";
import styles from "@/app/page.module.css";

export default function SkillPage() {
  const { t } = useTranslation();
  const { showError, showSuccess } = useToast();
  const [clientOrigin, setClientOrigin] = useState("");

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  const skillUrl = useMemo(() => {
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || clientOrigin || "https://clovapi.com";
    return `${origin}/skill?format=md`;
  }, [clientOrigin]);

  const agentPrompt = useMemo(() => t("skill.agentPrompt", { url: skillUrl }), [skillUrl, t]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      showSuccess(t("skill.copied"));
    } catch {
      showError(t("skill.copyFailed"));
    }
  }

  return (
    <div className="page-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="page-content mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
        <section className="panel">
          <div className="panel-body">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {t("skill.agentHintTitle")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("skill.agentHint")}</p>

            <div className={`${styles.terminalCard} mt-5 max-w-2xl`}>
              <div className={styles.terminalHeader}>
                <span className="text-xs text-muted-foreground">{t("skill.agentPromptLabel")}</span>
                <button
                  type="button"
                  className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  onClick={() => void copyPrompt()}
                >
                  {t("skill.copy")}
                </button>
              </div>
              <p className="p-4 text-sm leading-relaxed text-foreground sm:p-5 sm:text-[0.95rem]">{agentPrompt}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

import { useTranslation } from "react-i18next";

const API_STYLE_KEYS = ["chatCompletions", "anthropicMessages", "openaiResponses", "gemini"] as const;

export function HomeApiStyles() {
  const { t } = useTranslation();

  return (
    <section id="api-styles" className="relative z-[1] px-5 py-12 sm:px-6 md:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground">{t("home.apiStyles")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("home.apiStylesSubtitle")}
        </p>

        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-2">
          {API_STYLE_KEYS.map((key) => (
            <div
              key={key}
              className="bg-background p-5 transition-colors hover:bg-muted/20 sm:p-6"
            >
              <h3 className="font-semibold text-foreground">{t(`home.apiStyleItems.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`home.apiStyleItems.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

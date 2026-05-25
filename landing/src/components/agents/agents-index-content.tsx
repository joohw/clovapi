"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AGENT_PAGES, agentDisplayName } from "@/lib/seo-data";

export function AgentsIndexContent() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";

  return (
    <div className="page-wrap relative">
      <div className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("agents.indexTitle")}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{t("agents.indexSubtitle")}</p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_PAGES.map((agent) => (
            <Link
              key={agent.slug}
              href={`/agents/${agent.slug}`}
              className="group rounded-lg border border-border/60 bg-background p-5 transition-colors hover:border-border hover:bg-muted/20"
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={agent.icon} alt="" className="h-8 w-8 object-contain" />
                <h2 className="font-semibold text-foreground group-hover:underline">
                  {agentDisplayName(agent.slug, language)}
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t(`home.apiStyleItems.${agent.apiStyleKey}.title`)}
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          <Link href="/guides" className="text-foreground underline-offset-4 hover:underline">
            {t("guides.indexTitle")} →
          </Link>
          {" · "}
          <Link href="/compare/cc-switch" className="text-foreground underline-offset-4 hover:underline">
            {t("agents.compareLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

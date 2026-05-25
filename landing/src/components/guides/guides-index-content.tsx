"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { agentDisplayName } from "@/lib/seo-data";
import { getGuideContent, guidePathname, GUIDE_PAGES } from "@/lib/guides-data";

export function GuidesIndexContent() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";

  return (
    <div className="page-wrap relative">
      <div className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("guides.indexTitle")}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{t("guides.indexSubtitle")}</p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GUIDE_PAGES.map((guide) => {
            const content = getGuideContent(guide.slug, language);
            if (!content) return null;
            return (
              <Link
                key={guide.slug}
                href={guidePathname(guide.slug)}
                className="group rounded-lg border border-border/60 bg-background p-5 transition-colors hover:border-border hover:bg-muted/20"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {agentDisplayName(guide.agentSlug, language)}
                  {guide.vendorLabel ? ` · ${guide.vendorLabel}` : ""}
                </p>
                <h2 className="mt-2 font-semibold text-foreground group-hover:underline">{content.h1}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{content.intro}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

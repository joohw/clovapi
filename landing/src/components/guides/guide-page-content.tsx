"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ClientDownloadButtons } from "@/components/home/client-download-buttons";
import { ShellHighlight } from "@/components/shell-highlight";
import { agentDisplayName } from "@/lib/seo-data";
import { getGuideContent, guideBySlug, guidePathname, GUIDE_PAGES, type GuidePageDef } from "@/lib/guides-data";
import styles from "@/app/page.module.css";

type GuideContentProps = {
  slug: string;
};

export function GuidePageContent({ slug }: GuideContentProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const guide = guideBySlug(slug);
  const content = getGuideContent(slug, language);

  if (!guide || !content) return null;

  const agentName = agentDisplayName(guide.agentSlug, language);

  return (
    <div className="page-wrap relative">
      <article className="relative z-[1] mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <nav className="text-sm text-muted-foreground">
          <Link href="/guides" className="hover:text-foreground">
            {t("guides.indexTitle")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{content.h1}</span>
        </nav>

        <header className="mt-6 max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">{agentName}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{content.h1}</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{content.intro}</p>
        </header>

        <ClientDownloadButtons className="mt-6" />

        <ol className="mt-10 max-w-3xl space-y-8">
          {content.steps.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-border/60 bg-background p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground">
                <span className="mr-2 font-mono text-sm text-muted-foreground">{index + 1}.</span>
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {step.command ? (
                <div className={`${styles.terminalCard} mt-4`}>
                  <div className="p-4 font-mono text-sm">
                    <ShellHighlight code={step.command} className="text-foreground" />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        <aside className="mt-10 max-w-3xl rounded-lg border border-border/60 bg-muted/20 p-5 text-sm leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">{t("guides.tipsLabel")}</strong>
          <p className="mt-2">{content.tips}</p>
        </aside>

        <RelatedGuides current={guide} language={language} />
      </article>
    </div>
  );
}

function RelatedGuides({ current, language }: { current: GuidePageDef; language: "zh-CN" | "en" }) {
  const related = GUIDE_PAGES.filter((g) => g.slug !== current.slug).slice(0, 4);

  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">{language === "en" ? "More guides" : "更多教程"}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {related.map((guide) => {
          const content = getGuideContent(guide.slug, language);
          if (!content) return null;
          return (
            <li key={guide.slug}>
              <Link
                href={guidePathname(guide.slug)}
                className="inline-flex rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                {content.h1}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href={`/agents/${current.agentSlug}`}
            className="inline-flex rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {agentDisplayName(current.agentSlug, language)}
          </Link>
        </li>
      </ul>
    </section>
  );
}

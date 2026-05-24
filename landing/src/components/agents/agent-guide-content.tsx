"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ClientDownloadButtons } from "@/components/home/client-download-buttons";
import { ShellHighlight } from "@/components/shell-highlight";
import { AGENT_PAGES, agentDisplayName, type AgentPageDef } from "@/lib/seo-data";
import { getGuideContent, guidePathname, guidesForAgent } from "@/lib/guides-data";
import styles from "@/app/page.module.css";

type AgentGuideContentProps = {
  agent: AgentPageDef;
};

export function AgentGuideContent({ agent }: AgentGuideContentProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const name = agentDisplayName(agent.slug, language);
  const apiStyle = t(`home.apiStyleItems.${agent.apiStyleKey}.title`);
  const apiStyleDesc = t(`home.apiStyleItems.${agent.apiStyleKey}.description`);

  const workflowLines = [
    "npm i -g @clovapi/cli",
    "clovapi add --name prod",
    `clovapi switch --cli ${agent.cliFlag} prod`,
  ];
  const relatedGuides = guidesForAgent(agent.slug);

  return (
    <div className="page-wrap relative">
      <div className="relative z-[1] mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <nav className="text-sm text-muted-foreground">
          <Link href="/agents" className="hover:text-foreground">
            {t("agents.indexTitle")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{name}</span>
        </nav>

        <div className="mt-6 flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.icon} alt="" className="h-12 w-12 shrink-0 object-contain" />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t("agents.pageTitle", { name })}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {t("agents.pageSubtitle", { name })}
            </p>
          </div>
        </div>

        <ClientDownloadButtons className="mt-6" />

        <div className={`${styles.terminalCard} mt-8 max-w-2xl`}>
          <div className={styles.terminalHeader}>
            <span className="text-xs text-muted-foreground">{t("home.quickStart")}</span>
          </div>
          <div className="space-y-1.5 p-4 font-mono text-sm leading-relaxed sm:p-5">
            {workflowLines.map((line) => (
              <div key={line} className="flex gap-2">
                <span className="shrink-0 text-foreground/70">$</span>
                <ShellHighlight code={line} className="min-w-0 break-all text-foreground" />
              </div>
            ))}
          </div>
        </div>

        <section className="mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold text-foreground">{t("agents.apiStyleTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("agents.apiStyleSubtitle", { name })}
          </p>
          <div className="mt-4 rounded-lg border border-border/60 bg-background p-5">
            <p className="font-mono text-sm font-semibold text-foreground">{apiStyle}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{apiStyleDesc}</p>
          </div>
        </section>

        {relatedGuides.length > 0 ? (
          <section className="mt-10 max-w-3xl">
            <h2 className="text-xl font-semibold text-foreground">{t("agents.guidesTitle")}</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {relatedGuides.map((guide) => {
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
            </ul>
          </section>
        ) : null}

        <section className="mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold text-foreground">{t("agents.moreAgentsTitle")}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {AGENT_PAGES.filter((item) => item.slug !== agent.slug).map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/agents/${item.slug}`}
                  className="inline-flex rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  {agentDisplayName(item.slug, language)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

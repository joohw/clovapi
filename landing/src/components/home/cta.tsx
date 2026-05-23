"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClientDownloadButtons } from "@/components/home/client-download-buttons";

export function HomeCta() {
  const { t } = useTranslation();
  const githubUrl = (process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/joohw/clovapi").trim();

  return (
    <section className="relative z-[1] border-t border-border/40 px-5 py-12 sm:px-6 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl border border-border/60 bg-muted/15 p-8 sm:p-10 md:p-12">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{t("home.ctaTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("home.ctaSubtitle")}
          </p>
          <ClientDownloadButtons className="mt-6" />

          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/skill"
              className="btn btn-outline inline-flex h-10 items-center gap-2 px-5 text-sm font-medium sm:h-11"
            >
              <Sparkles className="size-4 opacity-80" aria-hidden />
              {t("home.installAgentSkill")}
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline inline-flex h-10 items-center px-5 text-sm font-medium sm:h-11"
            >
              {t("home.ctaGithub")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

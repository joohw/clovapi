"use client";

import { useTranslation } from "react-i18next";
import { actionButtonGridClass } from "@/components/home/client-download-buttons";
import { getDesktopDownloadUrls } from "@/lib/downloads";
import { GITHUB_REPO_URL } from "@/lib/site";

export function HomeCta() {
  const { t } = useTranslation();
  const { mac, windows } = getDesktopDownloadUrls();
  const githubUrl = GITHUB_REPO_URL;

  return (
    <section className="relative z-[1] px-5 py-12 sm:px-6 md:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{t("home.ctaTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("home.ctaSubtitle")}
        </p>

        <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
          <a href={mac} className={actionButtonGridClass} download rel="noopener noreferrer">
            {t("home.downloadMac")}
          </a>
          <a href={windows} className={actionButtonGridClass} download rel="noopener noreferrer">
            {t("home.downloadWindows")}
          </a>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonGridClass}
          >
            {t("home.ctaGithub")}
          </a>
        </div>
      </div>
    </section>
  );
}

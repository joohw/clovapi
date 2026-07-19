"use client";

import { FaApple, FaWindows } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  actionButtonPrimaryClass,
  actionButtonSecondaryClass,
} from "@/components/home/client-download-buttons";
import { getDesktopDownloadUrls } from "@/lib/downloads";

export function HomeCta() {
  const { t } = useTranslation();
  const { mac, windows } = getDesktopDownloadUrls();

  return (
    <section className="relative z-[1] px-5 py-12 sm:px-6 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground">{t("home.ctaTitle")}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("home.ctaSubtitle")}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={mac} className={actionButtonPrimaryClass} download rel="noopener noreferrer">
            <FaApple className="size-4 shrink-0" aria-hidden />
            {t("home.downloadMac")}
          </a>
          <a href={windows} className={actionButtonSecondaryClass} download rel="noopener noreferrer">
            <FaWindows className="size-4 shrink-0" aria-hidden />
            {t("home.downloadWindows")}
          </a>
        </div>
      </div>
    </section>
  );
}

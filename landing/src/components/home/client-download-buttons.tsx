"use client";

import { FaApple, FaWindows } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { getDesktopDownloadUrls } from "@/lib/downloads";

const actionButtonBaseClass =
  "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 sm:px-6";

export const actionButtonPrimaryClass = `${actionButtonBaseClass} border-transparent bg-foreground text-background visited:text-background hover:bg-foreground/85`;

export const actionButtonSecondaryClass = `${actionButtonBaseClass} border-border bg-card/70 text-foreground visited:text-foreground hover:bg-muted/70`;

type ClientDownloadButtonsProps = {
  className?: string;
};

export function ClientDownloadButtons({ className = "" }: ClientDownloadButtonsProps) {
  const { t } = useTranslation();
  const { mac, windows } = getDesktopDownloadUrls();

  return (
    <div className={`flex flex-wrap gap-3 ${className}`.trim()}>
      <a href={mac} className={actionButtonPrimaryClass} download rel="noopener noreferrer">
        <FaApple className="size-4 shrink-0" aria-hidden />
        {t("home.downloadMac")}
      </a>
      <a href={windows} className={actionButtonSecondaryClass} download rel="noopener noreferrer">
        <FaWindows className="size-4 shrink-0" aria-hidden />
        {t("home.downloadWindows")}
      </a>
    </div>
  );
}

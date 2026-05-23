"use client";

import { useTranslation } from "react-i18next";
import { getDesktopDownloadUrls } from "@/lib/downloads";

export const actionButtonClass =
  "btn btn-outline inline-flex h-11 min-h-11 items-center justify-center px-5 text-sm font-medium sm:px-6";

export const actionButtonGridClass = `${actionButtonClass} w-full text-center`;

type ClientDownloadButtonsProps = {
  className?: string;
};

export function ClientDownloadButtons({ className = "" }: ClientDownloadButtonsProps) {
  const { t } = useTranslation();
  const { mac, windows } = getDesktopDownloadUrls();

  return (
    <div className={`flex flex-wrap gap-3 ${className}`.trim()}>
      <a href={mac} className={actionButtonClass} download rel="noopener noreferrer">
        {t("home.downloadMac")}
      </a>
      <a href={windows} className={actionButtonClass} download rel="noopener noreferrer">
        {t("home.downloadWindows")}
      </a>
    </div>
  );
}

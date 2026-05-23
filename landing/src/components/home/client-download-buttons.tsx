"use client";

import { useEffect, useState } from "react";
import { Apple, Download, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDesktopDownloadUrls } from "@/lib/downloads";

type ClientPlatform = "mac" | "windows" | "other";

function detectClientPlatform(): ClientPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "other";
}

type ClientDownloadButtonsProps = {
  className?: string;
};

export function ClientDownloadButtons({ className = "" }: ClientDownloadButtonsProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<ClientPlatform>("other");
  const { mac, windows } = getDesktopDownloadUrls();

  useEffect(() => {
    setPlatform(detectClientPlatform());
  }, []);

  const buttonClass = (target: Exclude<ClientPlatform, "other">) => {
    const primary = platform === "other" || platform === target;
    return primary
      ? "btn inline-flex h-11 min-h-11 items-center gap-2 px-5 text-sm font-semibold sm:h-12 sm:min-h-12 sm:px-6"
      : "btn btn-outline inline-flex h-11 min-h-11 items-center gap-2 px-5 text-sm font-semibold sm:h-12 sm:min-h-12 sm:px-6";
  };

  return (
    <div className={`flex flex-wrap gap-3 ${className}`.trim()}>
      <a
        href={mac}
        className={buttonClass("mac")}
        download
        rel="noopener noreferrer"
      >
        <Apple className="size-4 shrink-0 opacity-90" aria-hidden />
        {t("home.downloadMac")}
        <Download className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </a>
      <a
        href={windows}
        className={buttonClass("windows")}
        download
        rel="noopener noreferrer"
      >
        <Monitor className="size-4 shrink-0 opacity-90" aria-hidden />
        {t("home.downloadWindows")}
        <Download className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </a>
    </div>
  );
}

"use client";

import { useTranslation } from "react-i18next";
import { getDesktopDownloadUrls } from "@/lib/downloads";

const DOWNLOAD_BASE = "https://downloads.clovapi.com";

function cardClass() {
  return "rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur transition-colors hover:border-foreground/20";
}

function linkClass(primary = false) {
  return primary
    ? "inline-flex items-center justify-center rounded-full border border-zinc-950 bg-zinc-950 px-5 py-2.5 text-sm font-semibold !text-white transition-colors hover:bg-zinc-800 dark:border-zinc-50 dark:bg-zinc-50 dark:!text-zinc-950 dark:hover:bg-zinc-200"
    : "inline-flex items-center justify-center rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold !text-foreground transition-colors hover:bg-muted";
}

export function DownloadPageContent() {
  const { t } = useTranslation();
  const { mac, windows } = getDesktopDownloadUrls();
  const githubFallback = "https://github.com/joohw/clovapi/releases/latest";

  return (
    <main className="min-h-[calc(100vh-var(--app-header-height))] bg-background px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{t("download.title")}</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {t("download.subtitle")}
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <article className={cardClass()}>
            <h2 className="text-xl font-semibold text-foreground">{t("download.macTitle")}</h2>
            <p className="mt-2 min-h-16 text-sm leading-6 text-muted-foreground">{t("download.macBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={mac} className={linkClass(true)} download rel="noopener noreferrer">
                {t("download.downloadMac")}
              </a>
              <a href={`${DOWNLOAD_BASE}/desktop/latest.txt`} className={linkClass()}>
                {t("download.desktopLatest")}
              </a>
            </div>
          </article>

          <article className={cardClass()}>
            <h2 className="text-xl font-semibold text-foreground">{t("download.windowsTitle")}</h2>
            <p className="mt-2 min-h-16 text-sm leading-6 text-muted-foreground">{t("download.windowsBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={windows} className={linkClass(true)} download rel="noopener noreferrer">
                {t("download.downloadWindows")}
              </a>
              <a href={githubFallback} className={linkClass()} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-border/70 bg-muted/25 p-5 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">{t("download.pathsTitle")}</h2>
          <ul className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-2">
            <li>{DOWNLOAD_BASE}/desktop/latest/clovapi-desktop-darwin-universal.dmg</li>
            <li>{DOWNLOAD_BASE}/desktop/latest/clovapi-desktop-windows-x64.exe</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

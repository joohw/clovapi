"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n/config";
import { localizedPath } from "@/lib/seo-data";
import { GITHUB_REPO_URL } from "@/lib/site";

export function HomeFooter() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const language: AppLanguage = pathname.startsWith("/en") ? "en" : "zh-CN";

  const githubUrl = GITHUB_REPO_URL;

  return (
    <footer className="relative z-[1] px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">
            <Link href={localizedPath("/", language)} className="transition-colors hover:text-muted-foreground">
              CLOVAPI
            </Link>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t("home.footerTagline")}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("home.footerCopyright")}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href={localizedPath("/about", language)} className="text-muted-foreground hover:text-foreground">
            {language === "en" ? "About" : "关于"}
          </Link>
          <Link href={localizedPath("/privacy", language)} className="text-muted-foreground hover:text-foreground">
            {language === "en" ? "Privacy" : "隐私"}
          </Link>
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@clovapi/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            npm
          </a>
        </div>
      </div>
    </footer>
  );
}

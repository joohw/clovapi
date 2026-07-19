"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppLanguage } from "@/i18n/config";
import { localizedPath } from "@/lib/seo-data";
import { GITHUB_REPO_URL } from "@/lib/site";

export function HomeFooter() {
  const pathname = usePathname();
  const language: AppLanguage = pathname.startsWith("/en") ? "en" : "zh-CN";

  const githubUrl = GITHUB_REPO_URL;

  return (
    <footer className="relative z-[1] px-5 py-8 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          <Link
            href={localizedPath("/", language)}
            className="font-semibold tracking-[0.08em] text-foreground transition-colors hover:text-muted-foreground"
          >
            CLOVAPI
          </Link>
        </p>

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

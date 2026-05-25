"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export function HomeFooter() {
  const { t } = useTranslation();
  const [clientOrigin, setClientOrigin] = useState("");

  const publicSiteUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || clientOrigin || "/",
    [clientOrigin],
  );

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  const githubUrl = (process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/joohw/clovapi").trim();

  return (
    <footer className="relative z-[1] border-t border-border/40 px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">
            <a href={publicSiteUrl} className="transition-colors hover:text-muted-foreground">
              CLOVAPI
            </a>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t("home.footerTagline")}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("home.footerCopyright")}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/agents" className="text-muted-foreground hover:text-foreground">
            {t("header.agents")}
          </Link>
          <Link href="/guides" className="text-muted-foreground hover:text-foreground">
            {t("header.guides")}
          </Link>
          <Link href="/blog" className="text-muted-foreground hover:text-foreground">
            {t("header.blog")}
          </Link>
          <Link href="/compare/cc-switch" className="text-muted-foreground hover:text-foreground">
            cc-switch
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
          <Link href="/skill" className="text-muted-foreground hover:text-foreground">
            {t("header.skill")}
          </Link>
        </div>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { applyThemeMode, initThemeMode, persistThemeMode, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

type HeaderLink = { text: string; to: string };

function normalizePath(path: string) {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function isNavActive(currentPath: string, href: string): boolean {
  const p = normalizePath(currentPath);
  const t = normalizePath(href);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(`${t}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(initThemeMode());
  }, []);

  const headerLinks = useMemo<HeaderLink[]>(() => {
    return [
      { text: "首页", to: "/" },
      { text: "文档", to: "/docs" },
      { text: "模型", to: "/models" },
      { text: "智能体", to: "/agents" },
    ];
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    applyThemeMode(nextTheme);
    persistThemeMode(nextTheme);
    setTheme(nextTheme);
  }

  function navLinkClass(active: boolean) {
    return cn(
      "relative rounded-md px-2.5 py-1.5 text-sm font-medium",
      "motion-safe:transition-[color,opacity] motion-safe:duration-300 motion-safe:ease-out",
      "motion-reduce:transition-none",
      active
        ? "font-semibold text-foreground opacity-100"
        : cn(
            "text-muted-foreground opacity-[0.62]",
            "hover:text-foreground hover:opacity-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "focus-visible:text-foreground focus-visible:opacity-100"
          )
    );
  }

  return (
    <header className="sticky top-0 z-40">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-md opacity-[0.72] motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out hover:opacity-100 hover:scale-[1.06] active:scale-[1.02] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="返回首页"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme === "dark" ? "/clover.svg" : "/clover-light.svg"} alt="" className="h-[1.35rem] w-[1.35rem]" />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto whitespace-nowrap">
            {headerLinks.map((link) => (
              <Link key={link.to} href={link.to} className={navLinkClass(isNavActive(pathname, link.to))}>
                {link.text}
              </Link>
            ))}
          </nav>
        </div>
        <div className="relative inline-flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>
    </header>
  );
}

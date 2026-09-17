"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import type { AppLanguage } from "@/i18n/config";
import { localizedPath } from "@/lib/seo-data";
import { applyThemeMode, persistThemeMode } from "@/lib/theme";
import styles from "./site-header.module.css";

export function SiteHeader() {
  const pathname = usePathname();
  const language: AppLanguage = pathname.startsWith("/en") ? "en" : "zh-CN";
  const english = language === "en";
  const home = localizedPath("/", language);
  const alternate = pathname.replace(/^\/(?:zh-CN|en)(?=\/|$)/, english ? "/zh-CN" : "/en");

  function toggleTheme() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyThemeMode(next);
    persistThemeMode(next);
  }

  return <header className={styles.header}>
    <div className={styles.inner}>
      <Link href={home} className={styles.brand} aria-label={english ? "clovapi home" : "clovapi 首页"}><span>CLOVAPI</span></Link>
      <div className={styles.actions}><Link href={localizedPath("/docs", language)} className={styles.modelsLink} aria-current={pathname.startsWith(localizedPath("/docs", language)) ? "page" : undefined}>{english ? "Docs" : "文档"}</Link><Link href={localizedPath("/models", language)} className={styles.modelsLink} aria-current={pathname === localizedPath("/models", language) ? "page" : undefined}>{english ? "Models" : "模型"}</Link><Link href={alternate} className={styles.language} aria-label={english ? "切换到中文" : "Switch to English"}>{english ? "中" : "EN"}</Link><button type="button" onClick={toggleTheme} className={styles.themeButton} aria-label={english ? "Toggle color theme" : "切换明暗主题"}><Sun size={16} className={styles.sun} /><Moon size={15} className={styles.moon} /></button><Link href={localizedPath("/console", language)} className={styles.consoleLink}>{english ? "Console" : "控制台"}<ArrowUpRight size={14} /></Link></div>
    </div>
  </header>;
}

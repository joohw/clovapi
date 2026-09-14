"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import type { AppLanguage } from "@/i18n/config";
import { initThemeMode, THEME_BOOT_SCRIPT } from "@/lib/theme";

export function ThemeInitializer({ language }: { language: AppLanguage }) {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;

    // Keep the pre-paint script out of client-side locale transitions.
    return <script id="clovapi-theme-init" dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />;
  });

  useLayoutEffect(() => {
    // A locale transition can remount <html> and reset its theme attributes.
    try {
      initThemeMode();
    } catch {}
  }, [language]);

  return null;
}

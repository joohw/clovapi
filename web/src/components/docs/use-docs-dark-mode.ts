"use client";

import { useEffect, useState } from "react";

/** 与 `document.documentElement` 上 `.dark` 同步（与 layout 主题脚本一致） */
export function useDocsDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  return dark;
}

"use client";

import { codeToHtml } from "shiki";
import { useEffect, useState } from "react";
import { useDocsDarkMode } from "./use-docs-dark-mode";
import styles from "./docs-curl-highlight.module.css";

type DocsCurlHighlightProps = {
  code: string;
};

export function DocsCurlHighlight({ code }: DocsCurlHighlightProps) {
  const dark = useDocsDarkMode();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const out = await codeToHtml(code.trimEnd(), {
          lang: "bash",
          theme: dark ? "one-dark-pro" : "one-light",
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  if (html == null) {
    return (
      <pre className={styles.fallback}>
        <code>{code}</code>
      </pre>
    );
  }

  return <div className={styles.wrap} dangerouslySetInnerHTML={{ __html: html }} />;
}

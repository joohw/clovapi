"use client";

import { ExternalLink } from "lucide-react";
import type { ApiDocOriginalSource } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { DocsEndpointMenu } from "./docs-endpoint-menu";
import { DocsCurlHighlight } from "./docs-curl-highlight";
import styles from "./docs-layout.module.css";

type DocsOriginalDocPanelProps = {
  variants: ApiDocOriginalSource[];
  activeSourceId: string;
  onActiveSourceIdChange: (id: string) => void;
};

export function DocsOriginalDocPanel({
  variants,
  activeSourceId,
  onActiveSourceIdChange,
}: DocsOriginalDocPanelProps) {
  const active = variants.find((v) => v.id === activeSourceId) ?? variants[0];
  if (!active) return null;

  const showPicker = variants.length > 1;

  const docToolbarTitleClass =
    "flex shrink-0 items-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

  const docLinkClass = cn(
    "flex shrink-0 items-center gap-1.5 self-stretch px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 dark:hover:bg-muted/30",
    "md:px-4",
  );

  return (
    <>
      <div className="flex min-h-11 shrink-0 items-stretch border-b border-border">
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-2.5 pl-4 md:flex-row md:items-center md:gap-4 md:pl-5 md:pr-2">
          <h2 className={docToolbarTitleClass}>文档</h2>
          {showPicker ? (
            <div className="min-w-0 flex-1">
              <DocsEndpointMenu
                variants={variants}
                activeSourceId={activeSourceId}
                onSelect={onActiveSourceIdChange}
              />
            </div>
          ) : active.originalEndpoint ? (
            <p
              className="flex min-h-9 min-w-0 flex-1 items-center truncate font-mono text-[11px] leading-none text-foreground"
              title={active.originalEndpoint}
            >
              {active.originalEndpoint}
            </p>
          ) : null}
        </div>
        {active.originalDocUrl ? (
          <a
            href={active.originalDocUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={docLinkClass}
          >
            {active.originalDocLabel || "原始文档"}
            <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
          </a>
        ) : null}
      </div>
      <article className="min-h-0 flex-1 overflow-auto px-4 py-2.5 md:px-5 md:py-3">
        <div className={styles.markdown}>
          <DocsCurlHighlight code={active.curlExample} key={activeSourceId} />
        </div>
      </article>
    </>
  );
}

"use client";

import { ExternalLink } from "lucide-react";
import type { ApiDocOriginalSource } from "@/lib/docs";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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

  return (
    <>
      {showPicker ? (
        <div className="flex shrink-0 flex-col border-b border-border">
          <div className="flex min-w-0 flex-col gap-2 py-2.5 pl-4 md:flex-row md:items-start md:gap-4 md:pl-5 md:pr-2">
            <h2 className="shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              文档
            </h2>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                原始端点
              </span>
              <Select
                value={activeSourceId}
                onValueChange={(v) => {
                  if (v) onActiveSourceIdChange(v);
                }}
              >
                <SelectTrigger
                  size="default"
                  className="h-auto min-h-9 w-full min-w-0 flex-1 border-border/80 py-1.5 whitespace-normal data-[size=default]:h-auto"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:flex-row sm:items-center sm:gap-2">
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{active.label}</span>
                    <span
                      className="min-w-0 truncate font-mono text-[11px] text-foreground"
                      title={active.originalEndpoint}
                    >
                      {active.originalEndpoint}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent align="start" className="min-w-[var(--anchor-width)]">
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex max-w-[min(100vw-2rem,28rem)] flex-col gap-0.5 py-0.5 text-left">
                        <span className="text-sm font-medium leading-tight">{v.label}</span>
                        <span
                          className="break-all font-mono text-[10px] leading-snug text-muted-foreground"
                          title={v.originalEndpoint}
                        >
                          {v.originalEndpoint}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {active.originalDocUrl ? (
              <a
                href={active.originalDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 self-start text-xs font-medium text-foreground underline-offset-2 hover:underline md:self-center md:border-l md:border-border md:pl-4"
              >
                {active.originalDocLabel || "原始文档"}
                <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-stretch border-b border-border">
          <div className="flex min-w-0 flex-1 items-center gap-x-3 py-2.5 pl-4 md:pl-5">
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              文档
            </h2>
            {active.originalEndpoint ? (
              <p
                className="min-w-0 flex-1 truncate font-mono text-[11px] leading-none text-zinc-600 dark:text-zinc-400"
                title={active.originalEndpoint}
              >
                <span className="text-zinc-500 dark:text-zinc-500">原始端点</span>{" "}
                <span className="text-foreground">{active.originalEndpoint}</span>
              </p>
            ) : null}
          </div>
          {active.originalDocUrl ? (
            <a
              href={active.originalDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex shrink-0 items-center gap-1.5 self-stretch border-l border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 dark:hover:bg-muted/30",
                "md:px-4",
              )}
            >
              {active.originalDocLabel || "原始文档"}
              <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
            </a>
          ) : null}
        </div>
      )}
      <article className="min-h-0 flex-1 overflow-auto px-4 py-2.5 md:px-5 md:py-3">
        <div className={styles.markdown}>
          <DocsCurlHighlight code={active.curlExample} key={activeSourceId} />
        </div>
      </article>
    </>
  );
}

"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown } from "lucide-react";
import type { ApiDocOriginalSource } from "@/lib/docs";
import { cn } from "@/lib/utils";

type DocsEndpointMenuProps = {
  variants: ApiDocOriginalSource[];
  activeSourceId: string;
  onSelect: (id: string) => void;
};

export function DocsEndpointMenu({ variants, activeSourceId, onSelect }: DocsEndpointMenuProps) {
  const active = variants.find((v) => v.id === activeSourceId) ?? variants[0];
  if (!active || variants.length <= 1) return null;

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        type="button"
        className={cn(
          "inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-border/80 bg-muted/35 px-3 py-0 text-sm shadow-none",
          "transition-colors hover:bg-muted/45",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-row items-center gap-2 overflow-hidden text-left">
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{active.label}</span>
          <span
            className="min-w-0 truncate font-mono text-[11px] text-foreground"
            title={active.originalEndpoint}
          >
            {active.originalEndpoint}
          </span>
        </span>
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground opacity-80" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50 outline-none">
          <Menu.Popup
            className={cn(
              "relative max-h-[min(60vh,22rem)] min-w-[var(--anchor-width)] max-w-[min(100vw-2rem,36rem)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
              "origin-(--transform-origin) duration-100",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            {variants.map((v) => {
              const selected = v.id === activeSourceId;
              return (
                <Menu.Item
                  key={v.id}
                  onClick={() => onSelect(v.id)}
                  className={cn(
                    "flex cursor-default flex-row items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none select-none",
                    "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                    selected && "bg-muted/45 data-highlighted:bg-muted/55 dark:bg-muted/30",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-row items-center gap-2 overflow-hidden">
                    <span className="shrink-0 font-medium">{v.label}</span>
                    <span
                      className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
                      title={v.originalEndpoint}
                    >
                      {v.originalEndpoint}
                    </span>
                  </span>
                  {selected ? <Check className="pointer-events-none size-4 shrink-0 opacity-80" aria-hidden /> : null}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

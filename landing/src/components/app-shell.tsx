"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const isConsole = segment === "console";
  const isDocs = segment === "docs";

  return (
    <>
      {!isConsole && <SiteHeader />}
      <main className={isConsole || isDocs ? undefined : "pt-[var(--app-header-height)]"}>{children}</main>
    </>
  );
}

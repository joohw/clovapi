"use client";

import { SiteHeader } from "@/components/site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="pt-[var(--app-header-height)]">{children}</main>
    </>
  );
}

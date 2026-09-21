import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { notFound } from "next/navigation";
import { isAppLanguage } from "@/i18n/config";
import { docsI18nUI } from "@/lib/docs-i18n";
import { docsSource } from "@/lib/docs-source";

type DocsLayoutPageProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function DocsSectionLayout({ children, params }: DocsLayoutPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();

  return (
    <RootProvider
      theme={{ enabled: false }}
      i18n={docsI18nUI.provider(locale)}
      search={{ options: { type: "static", api: "/api/docs-search" } }}
    >
      <div className="clovapi-docs">
        <DocsLayout
          tree={docsSource.getPageTree(locale)}
          nav={{ enabled: false }}
          sidebar={{ collapsible: false }}
          themeSwitch={{ enabled: false }}
          i18n={false}
        >
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}

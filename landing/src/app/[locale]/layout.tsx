import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
import { StructuredData } from "@/components/structured-data";
import { ToastProvider } from "@/components/ui/toast-provider";
import {
  isAppLanguage,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "@/i18n/config";
import { buildBaseJsonLdGraph } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "@fontsource-variable/outfit";
import "@/app/globals.css";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LANGUAGES.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();

  const language: AppLanguage = locale;
  const jsonLd = buildBaseJsonLdGraph({ siteUrl: PUBLIC_SITE_URL, language });

  return (
    <html lang={language} suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <StructuredData data={jsonLd} />
        <I18nProvider language={language}>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

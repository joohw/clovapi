import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformConsole } from "@/components/platform/platform-console";
import { isAppLanguage } from "@/i18n/config";

type ConsolePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export async function generateMetadata({ params }: ConsolePageProps): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "en" ? "Console · clovapi" : "控制台 · clovapi",
    description: locale === "en"
      ? "Sign in to the clovapi console and manage API credentials, contribution controls, and credit history."
      : "登录 clovapi 控制台，管理调用凭证、API 贡献规则与积分记录。",
    robots: { index: false, follow: true },
  };
}

export default async function ConsolePage({ params, searchParams }: ConsolePageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();
  const { tab } = await searchParams;
  const initialSection = tab === "keys" ? "keys"
    : tab === "contribute" || tab === "contributions" ? "contributions"
      : tab === "ledger" ? "ledger" : "overview";
  return <PlatformConsole key={`${locale}-${initialSection}`} language={locale} initialSection={initialSection} />;
}

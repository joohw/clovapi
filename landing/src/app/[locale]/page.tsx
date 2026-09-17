import { notFound } from "next/navigation";
import { SharedLanding } from "@/components/home/shared-landing";
import { StructuredData } from "@/components/structured-data";
import { isAppLanguage } from "@/i18n/config";
import { buildFaqJsonLd, buildPageMetadata } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: HomePageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) return {};
  return buildPageMetadata("home", locale);
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();
  const faqLd = buildFaqJsonLd({ siteUrl: PUBLIC_SITE_URL, language: locale });

  return (
    <>
      <StructuredData data={faqLd} />
      <SharedLanding language={locale} />
    </>
  );
}

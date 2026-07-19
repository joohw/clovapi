import { notFound } from "next/navigation";
import { HomeApiStyles } from "@/components/home/api-styles";
import { HomeCta } from "@/components/home/cta";
import { HomeFaq } from "@/components/home/faq";
import { HomeFeatures } from "@/components/home/features";
import { HomeFooter } from "@/components/home/footer";
import { HomeHero } from "@/components/home/hero";
import { LandingBackdrop } from "@/components/home/landing-backdrop";
import { StructuredData } from "@/components/structured-data";
import { isAppLanguage } from "@/i18n/config";
import { buildFaqJsonLd, buildPageMetadata } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";
import styles from "@/app/page.module.css";

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
      <div className={`page-wrap ${styles.home} relative`}>
        <LandingBackdrop />
        <div className="relative z-[1] w-full min-w-0">
          <HomeHero />
          <HomeFeatures />
          <HomeApiStyles />
          <HomeFaq />
          <HomeCta />
          <HomeFooter />
        </div>
      </div>
    </>
  );
}

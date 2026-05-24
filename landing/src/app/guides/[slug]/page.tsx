import { notFound } from "next/navigation";
import { GuidePageContent } from "@/components/guides/guide-page-content";
import { StructuredData } from "@/components/structured-data";
import { buildGuideHowToJsonLd, getGuideContent, guideBySlug, GUIDE_PAGES } from "@/lib/guides-data";
import { buildGuidePageMetadata, resolveSeoLanguage, resolveSiteUrl } from "@/lib/seo";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return GUIDE_PAGES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps) {
  const { slug } = await params;
  if (!guideBySlug(slug)) return {};
  return buildGuidePageMetadata(slug);
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const [siteUrl, language] = await Promise.all([resolveSiteUrl(), resolveSeoLanguage()]);
  if (!getGuideContent(slug, language)) notFound();

  const jsonLd = buildGuideHowToJsonLd({ siteUrl, language, slug });

  return (
    <>
      <StructuredData data={jsonLd} />
      <GuidePageContent slug={slug} />
    </>
  );
}

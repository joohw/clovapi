import { notFound } from "next/navigation";
import { ModelCatalogPage } from "@/components/models/model-catalog";
import { isAppLanguage } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/seo";

type ModelsPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: ModelsPageProps) {
  const { locale } = await params;
  return isAppLanguage(locale) ? buildPageMetadata("models", locale) : {};
}

export default async function ModelsPage({ params }: ModelsPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();
  return <ModelCatalogPage language={locale} />;
}

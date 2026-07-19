import { notFound } from "next/navigation";
import { BlogIndexContent } from "@/components/blog/blog-index-content";
import { isAppLanguage } from "@/i18n/config";
import { getAllBlogPosts } from "@/lib/blog-data.server";
import { buildPageMetadata } from "@/lib/seo";

type BlogIndexPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: BlogIndexPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) return {};
  return buildPageMetadata("blog", locale);
}

export default async function BlogIndexPage({ params }: BlogIndexPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();

  return <BlogIndexContent posts={getAllBlogPosts(locale)} language={locale} />;
}

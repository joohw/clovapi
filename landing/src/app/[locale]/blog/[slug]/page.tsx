import { notFound } from "next/navigation";
import { BlogPostContent } from "@/components/blog/blog-post-content";
import { StructuredData } from "@/components/structured-data";
import {
  isAppLanguage,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "@/i18n/config";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import {
  buildBlogBreadcrumbJsonLd,
  buildBlogPostingJsonLd,
  getAllBlogPosts,
  getBlogPost,
} from "@/lib/blog-data.server";
import { renderMarkdown } from "@/lib/markdown";
import { hreflangUrl } from "@/lib/seo-data";
import { PUBLIC_SITE_URL, SITE_NAME } from "@/lib/site";

type BlogPostPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  return SUPPORTED_LANGUAGES.flatMap((locale) =>
    BLOG_POSTS.map((post) => ({ locale, slug: post.slug })),
  );
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { locale, slug } = await params;
  if (!isAppLanguage(locale)) return {};
  const post = getBlogPost(slug, locale);
  if (!post) return {};

  const pathname = blogPathname(slug);
  const canonical = hreflangUrl(PUBLIC_SITE_URL, pathname, locale);
  const ogImage = locale === "en" ? "/use-case-en.png" : "/use-case-zh.png";

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical,
      languages: {
        "zh-CN": hreflangUrl(PUBLIC_SITE_URL, pathname, "zh-CN"),
        en: hreflangUrl(PUBLIC_SITE_URL, pathname, "en"),
        "x-default": hreflangUrl(PUBLIC_SITE_URL, pathname, "zh-CN"),
      },
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: post.title,
      description: post.description,
      url: canonical,
      locale: locale === "en" ? "en_US" : "zh_CN",
      publishedTime: post.date || undefined,
      modifiedTime: post.lastModified.toISOString(),
      images: [{ url: `${PUBLIC_SITE_URL}${ogImage}`, width: 720, height: 760, alt: post.title }],
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.description,
      images: [`${PUBLIC_SITE_URL}${ogImage}`],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { locale, slug } = await params;
  if (!isAppLanguage(locale)) notFound();

  const post = await buildLocalizedPost(slug, locale);
  if (!post) notFound();

  const related = getAllBlogPosts(locale)
    .filter((item) => item.slug !== slug)
    .slice(0, 2);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      buildBlogPostingJsonLd({ siteUrl: PUBLIC_SITE_URL, language: locale, slug }),
      buildBlogBreadcrumbJsonLd({ siteUrl: PUBLIC_SITE_URL, language: locale, slug }),
    ],
  };

  return (
    <>
      <StructuredData data={jsonLd} />
      <BlogPostContent post={post} related={related} language={locale} />
    </>
  );
}

async function buildLocalizedPost(slug: string, language: AppLanguage) {
  const post = getBlogPost(slug, language);
  if (!post) return null;
  const html = await renderMarkdown(post.body);
  return {
    meta: {
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.date,
      lastModified: post.lastModified,
      kind: post.kind,
    },
    html,
  };
}

import { notFound } from "next/navigation";
import { BlogPostContent } from "@/components/blog/blog-post-content";
import { ServerScripts } from "@/components/server-scripts";
import { SUPPORTED_LANGUAGES, type AppLanguage } from "@/i18n/config";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import {
  buildBlogBreadcrumbJsonLd,
  buildBlogPostingJsonLd,
  getBlogPost,
} from "@/lib/blog-data.server";
import { renderMarkdown } from "@/lib/markdown";
import { resolveSeoLanguage, resolveSiteUrl } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const language = await resolveSeoLanguage();
  const post = getBlogPost(slug, language);
  if (!post) return {};
  const siteUrl = await resolveSiteUrl();
  const canonical = `${siteUrl}${blogPathname(slug)}`;
  const ogImage = language === "en" ? "/use-case-en.png" : "/use-case-zh.png";

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical,
      languages: {
        "zh-CN": `${canonical}?lang=zh-CN`,
        en: `${canonical}?lang=en`,
      },
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: post.title,
      description: post.description,
      url: canonical,
      publishedTime: post.date || undefined,
      modifiedTime: post.lastModified.toISOString(),
      images: [{ url: `${siteUrl}${ogImage}`, width: 730, height: 731, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [`${siteUrl}${ogImage}`],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  if (!SUPPORTED_LANGUAGES.some((language: AppLanguage) => getBlogPost(slug, language))) {
    notFound();
  }

  const postsByLanguage = {
    "zh-CN": await buildLocalizedPost(slug, "zh-CN"),
    en: await buildLocalizedPost(slug, "en"),
  };
  const language = await resolveSeoLanguage();
  const siteUrl = await resolveSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      buildBlogPostingJsonLd({ siteUrl, language, slug }),
      buildBlogBreadcrumbJsonLd({ siteUrl, language, slug }),
    ],
  };

  return (
    <>
      <ServerScripts jsonLd={JSON.stringify(jsonLd).replace(/</g, "\\u003c")} />
      <BlogPostContent postsByLanguage={postsByLanguage} />
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

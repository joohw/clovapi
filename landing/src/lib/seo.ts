import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { LANG_STORAGE_KEY, type AppLanguage } from "@/i18n/config";
import { resolveLanguage } from "@/i18n/resolve-language";
import {
  hreflangUrl,
  pathnameForPage,
  resolvePageCopy,
  SEO_COPY,
  type SeoPageKey,
} from "@/lib/seo-data";
import { getGuideContent, guidePathname } from "@/lib/guides-data";
import { blogPathname } from "@/lib/blog-data";
import { getBlogPost } from "@/lib/blog-data.server";
import { getPublicSiteUrlFromRequest, normalizePath, SITE_NAME } from "@/lib/site";

export type { AgentPageDef, FaqItem, SeoPageKey } from "@/lib/seo-data";
export {
  AGENT_PAGES,
  agentBySlug,
  agentDisplayName,
  buildAgentPageJsonLd,
  buildBaseJsonLdGraph,
  buildFaqJsonLd,
  FAQ_ITEMS,
  getHomeTitle,
} from "@/lib/seo-data";

export async function resolveSeoLanguage(): Promise<AppLanguage> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveLanguage({
    cookie: cookieStore.get(LANG_STORAGE_KEY)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export async function resolveSiteUrl(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  return getPublicSiteUrlFromRequest(host);
}

export async function buildPageMetadata(page: SeoPageKey, slugArg?: string): Promise<Metadata> {
  const language = await resolveSeoLanguage();
  const siteUrl = await resolveSiteUrl();
  const pathname = pathnameForPage(page, slugArg);
  const { title, description, ogImage } = resolvePageCopy(page, language, slugArg);
  const canonical = `${siteUrl}${pathname}`;

  return buildMetadataFromCopy({ siteUrl, language, pathname, title, description, ogImage });
}

export async function buildGuidePageMetadata(slug: string): Promise<Metadata> {
  const language = await resolveSeoLanguage();
  const siteUrl = await resolveSiteUrl();
  const content = getGuideContent(slug, language);
  if (!content) return {};

  const pathname = guidePathname(slug);
  return buildMetadataFromCopy({
    siteUrl,
    language,
    pathname,
    title: content.metaTitle,
    description: content.metaDescription,
    ogImage: SEO_COPY[language].home.ogImage,
  });
}

export async function buildBlogPostPageMetadata(slug: string): Promise<Metadata> {
  const language = await resolveSeoLanguage();
  const siteUrl = await resolveSiteUrl();
  const post = getBlogPost(slug, language);
  if (!post) return {};

  const pathname = blogPathname(slug);
  return buildMetadataFromCopy({
    siteUrl,
    language,
    pathname,
    title: post.title,
    description: post.description || post.title,
    ogImage: SEO_COPY[language].home.ogImage,
    openGraphType: "article",
    publishedTime: post.date || undefined,
  });
}

function buildMetadataFromCopy(options: {
  siteUrl: string;
  language: AppLanguage;
  pathname: string;
  title: string;
  description: string;
  ogImage: string;
  openGraphType?: "website" | "article";
  publishedTime?: string;
}): Metadata {
  const { siteUrl, language, pathname, title, description, ogImage, openGraphType = "website", publishedTime } = options;
  const canonical = `${siteUrl}${normalizePath(pathname)}`;

  return {
    title,
    description,
    icons: {
      icon: [
        {
          url: "/clover-light.svg",
          type: "image/svg+xml",
          media: "(prefers-color-scheme: light)",
        },
        {
          url: "/clover.svg",
          type: "image/svg+xml",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      shortcut: "/favicon.ico",
    },
    alternates: {
      canonical,
      languages: {
        "zh-CN": hreflangUrl(siteUrl, pathname, "zh-CN"),
        en: hreflangUrl(siteUrl, pathname, "en"),
        "x-default": hreflangUrl(siteUrl, pathname, "zh-CN"),
      },
    },
    openGraph: {
      type: openGraphType,
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: language === "zh-CN" ? "zh_CN" : "en_US",
      alternateLocale: language === "zh-CN" ? ["en_US"] : ["zh_CN"],
      images: [{ url: `${siteUrl}${ogImage}`, width: 730, height: 731, alt: title }],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}${ogImage}`],
    },
  };
}

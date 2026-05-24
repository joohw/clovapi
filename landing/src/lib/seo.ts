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

function buildMetadataFromCopy(options: {
  siteUrl: string;
  language: AppLanguage;
  pathname: string;
  title: string;
  description: string;
  ogImage: string;
}): Metadata {
  const { siteUrl, language, pathname, title, description, ogImage } = options;
  const canonical = `${siteUrl}${normalizePath(pathname)}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        "zh-CN": hreflangUrl(siteUrl, pathname, "zh-CN"),
        en: hreflangUrl(siteUrl, pathname, "en"),
        "x-default": hreflangUrl(siteUrl, pathname, "zh-CN"),
      },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: language === "zh-CN" ? "zh_CN" : "en_US",
      alternateLocale: language === "zh-CN" ? ["en_US"] : ["zh_CN"],
      images: [{ url: `${siteUrl}${ogImage}`, width: 730, height: 731, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}${ogImage}`],
    },
  };
}

import type { Metadata } from "next";
import type { AppLanguage } from "@/i18n/config";
import {
  hreflangUrl,
  pathnameForPage,
  resolvePageCopy,
  type SeoPageKey,
} from "@/lib/seo-data";
import { normalizePath, PUBLIC_SITE_URL, SITE_NAME } from "@/lib/site";

export type { FaqItem, SeoPageKey } from "@/lib/seo-data";
export {
  buildBaseJsonLdGraph,
  buildFaqJsonLd,
  FAQ_ITEMS,
} from "@/lib/seo-data";

export function buildPageMetadata(page: SeoPageKey, language: AppLanguage): Metadata {
  const siteUrl = PUBLIC_SITE_URL;
  const pathname = pathnameForPage(page);
  const { title, description, ogImage } = resolvePageCopy(page, language);

  const canonical = hreflangUrl(siteUrl, normalizePath(pathname), language);
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME, url: siteUrl }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "developer tools",
    icons: {
      icon: [
        { url: "/clover-light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
        { url: "/clover.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
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
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: language === "zh-CN" ? "zh_CN" : "en_US",
      alternateLocale: language === "zh-CN" ? ["en_US"] : ["zh_CN"],
      images: [{ url: `${siteUrl}${ogImage}`, width: 720, height: 760, alt: title }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [`${siteUrl}${ogImage}`],
    },
  };
}

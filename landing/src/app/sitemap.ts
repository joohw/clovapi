import type { MetadataRoute } from "next";
import { SUPPORTED_LANGUAGES } from "@/i18n/config";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import { getBlogPost } from "@/lib/blog-data.server";
import { docsSource } from "@/lib/docs-source";
import { hreflangUrl, localizedPath } from "@/lib/seo-data";
import { PUBLIC_SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = PUBLIC_SITE_URL;
  const postLastModified = BLOG_POSTS.map((post) =>
    getBlogPost(post.slug, "zh-CN")?.lastModified ?? getBlogPost(post.slug, "en")?.lastModified,
  ).filter((date): date is Date => date !== undefined);
  const blogLastModified = postLastModified.length
    ? new Date(Math.max(...postLastModified.map((date) => date.getTime())))
    : undefined;

  const staticPages = [
    { pathname: "/", changeFrequency: "weekly" as const, priority: 1 },
    { pathname: "/models", changeFrequency: "daily" as const, priority: 0.9 },
    { pathname: "/skill", changeFrequency: "monthly" as const, priority: 0.7 },
    { pathname: "/blog", changeFrequency: "weekly" as const, priority: 0.85, lastModified: blogLastModified },
    { pathname: "/about", changeFrequency: "monthly" as const, priority: 0.55 },
    { pathname: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  ];
  const pages = [
    ...staticPages,
    ...BLOG_POSTS.map((post) => ({
      pathname: blogPathname(post.slug),
      changeFrequency: "monthly" as const,
      priority: post.priority,
      lastModified:
        getBlogPost(post.slug, "zh-CN")?.lastModified ??
        getBlogPost(post.slug, "en")?.lastModified,
    })),
  ];

  const localizedPages = pages.flatMap((page) =>
    SUPPORTED_LANGUAGES.map((language) => ({
      url: `${siteUrl}${localizedPath(page.pathname, language)}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      lastModified: page.lastModified,
      alternates: {
        languages: {
          "zh-CN": hreflangUrl(siteUrl, page.pathname, "zh-CN"),
          en: hreflangUrl(siteUrl, page.pathname, "en"),
          "x-default": hreflangUrl(siteUrl, page.pathname, "zh-CN"),
        },
      },
    })),
  );

  const docsPages = docsSource.getPages().map((page) => {
    const pathname = `/docs${page.slugs.length ? `/${page.slugs.join("/")}` : ""}`;
    return {
      url: `${siteUrl}${page.url}`,
      changeFrequency: "weekly" as const,
      priority: page.slugs.length ? 0.75 : 0.9,
      alternates: {
        languages: {
          "zh-CN": hreflangUrl(siteUrl, pathname, "zh-CN"),
          en: hreflangUrl(siteUrl, pathname, "en"),
          "x-default": hreflangUrl(siteUrl, pathname, "zh-CN"),
        },
      },
    };
  });

  return [...localizedPages, ...docsPages];
}

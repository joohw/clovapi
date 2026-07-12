import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import { getBlogPost } from "@/lib/blog-data.server";
import { getPublicSiteUrlFromRequest } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const siteUrl = getPublicSiteUrlFromRequest(host);
  const postLastModified = BLOG_POSTS.map((post) =>
    getBlogPost(post.slug, "zh-CN")?.lastModified ?? getBlogPost(post.slug, "en")?.lastModified,
  ).filter((date): date is Date => date !== undefined);
  const blogLastModified = postLastModified.length
    ? new Date(Math.max(...postLastModified.map((date) => date.getTime())))
    : undefined;

  return [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/skill`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/blog`, changeFrequency: "weekly", priority: 0.85, lastModified: blogLastModified },
    ...BLOG_POSTS.map((post) => ({
      url: `${siteUrl}${blogPathname(post.slug)}`,
      changeFrequency: "monthly" as const,
      priority: post.priority,
      lastModified:
        getBlogPost(post.slug, "zh-CN")?.lastModified ??
        getBlogPost(post.slug, "en")?.lastModified,
    })),
  ];
}

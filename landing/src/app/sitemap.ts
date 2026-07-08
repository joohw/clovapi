import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import { getPublicSiteUrlFromRequest } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const siteUrl = getPublicSiteUrlFromRequest(host);
  const lastModified = new Date();

  return [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1, lastModified },
    { url: `${siteUrl}/skill`, changeFrequency: "monthly", priority: 0.7, lastModified },
    { url: `${siteUrl}/skill.md`, changeFrequency: "monthly", priority: 0.55, lastModified },
    { url: `${siteUrl}/blog`, changeFrequency: "weekly", priority: 0.85, lastModified },
    ...BLOG_POSTS.map((post) => ({
      url: `${siteUrl}${blogPathname(post.slug)}`,
      changeFrequency: "monthly" as const,
      priority: post.priority,
      lastModified,
    })),
  ];
}

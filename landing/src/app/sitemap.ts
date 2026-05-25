import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { AGENT_PAGES } from "@/lib/seo-data";
import { BLOG_POSTS } from "@/lib/blog-data";
import { GUIDE_PAGES } from "@/lib/guides-data";
import { getPublicSiteUrlFromRequest } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const siteUrl = getPublicSiteUrlFromRequest(host);
  const lastModified = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1, lastModified },
    { url: `${siteUrl}/agents`, changeFrequency: "weekly", priority: 0.9, lastModified },
    { url: `${siteUrl}/guides`, changeFrequency: "weekly", priority: 0.9, lastModified },
    { url: `${siteUrl}/blog`, changeFrequency: "weekly", priority: 0.88, lastModified },
    { url: `${siteUrl}/compare/cc-switch`, changeFrequency: "monthly", priority: 0.85, lastModified },
    { url: `${siteUrl}/skill`, changeFrequency: "weekly", priority: 0.8, lastModified },
  ];

  for (const agent of AGENT_PAGES) {
    entries.push({
      url: `${siteUrl}/agents/${agent.slug}`,
      changeFrequency: "monthly",
      priority: agent.slug === "claude-code" || agent.slug === "codex" ? 0.9 : 0.75,
      lastModified,
    });
  }

  for (const guide of GUIDE_PAGES) {
    entries.push({
      url: `${siteUrl}/guides/${guide.slug}`,
      changeFrequency: "monthly",
      priority: guide.priority,
      lastModified,
    });
  }

  for (const post of BLOG_POSTS) {
    entries.push({
      url: `${siteUrl}/blog/${post.slug}`,
      changeFrequency: "monthly",
      priority: post.priority,
      lastModified,
    });
  }

  return entries;
}

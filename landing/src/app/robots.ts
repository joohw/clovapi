import type { MetadataRoute } from "next";
import { PUBLIC_SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = PUBLIC_SITE_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

import { GUIDE_SLUGS } from "@/lib/guides-data";

export type BlogPostDef = {
  slug: string;
  priority: number;
  kind: "blog" | "guide";
};

export const BLOG_POSTS: BlogPostDef[] = [
  { slug: "codex-subscription-to-local-api", priority: 0.85, kind: "blog" },
  { slug: "local-model-api-proxy", priority: 0.82, kind: "blog" },
  { slug: "debug-local-model-api-calls", priority: 0.78, kind: "blog" },
  ...GUIDE_SLUGS.map((slug, index) => ({
    slug,
    priority: 0.8 - index * 0.02,
    kind: "guide" as const,
  })),
];

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  lastModified: Date;
  kind: "blog" | "guide";
};

export type BlogPost = BlogPostMeta & {
  body: string;
};

export function blogBySlug(slug: string): BlogPostDef | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function blogPathname(slug: string): string {
  return `/blog/${slug}`;
}

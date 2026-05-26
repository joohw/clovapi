export type BlogPostDef = {
  slug: string;
  priority: number;
};

export const BLOG_POSTS: BlogPostDef[] = [
  { slug: "local-proxy-for-agent-cli", priority: 0.85 },
  { slug: "switch-claude-code-api-without-env-vars", priority: 0.82 },
  { slug: "codex-subscription-to-local-api", priority: 0.81 },
  { slug: "manage-multiple-api-profiles", priority: 0.8 },
  { slug: "desktop-app-vs-cli-workflow", priority: 0.78 },
  { slug: "switch-opencode-upstream-with-clovapi", priority: 0.76 },
  { slug: "anthropic-oauth-ban-agent-workflow", priority: 0.75 },
  { slug: "stop-diy-proxy-sprawl-for-agent-cli", priority: 0.74 },
  { slug: "claude-code-tier-routing-on-a-budget", priority: 0.73 },
  { slug: "switch-between-claude-codex-opencode", priority: 0.72 },
  { slug: "cursor-terminal-agent-without-plugins", priority: 0.71 },
];

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  lastModified: Date;
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

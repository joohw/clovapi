import Link from "next/link";
import type { AppLanguage } from "@/i18n/config";
import { blogPathname, type BlogPostMeta } from "@/lib/blog-data";
import { localizedPath } from "@/lib/seo-data";

type BlogIndexContentProps = {
  posts: BlogPostMeta[];
  language: AppLanguage;
};

export function BlogIndexContent({ posts, language }: BlogIndexContentProps) {
  const english = language === "en";

  return (
    <div className="page-wrap relative">
      <div className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <h1 className="text-balance text-2xl font-medium leading-relaxed tracking-[-0.015em] text-foreground">
          {english ? "Articles" : "博客"}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {english
            ? "Tutorials and posts on local proxying, subscription access, protocol conversion, and call debugging."
            : "教程和博客都在这里：本地代理、订阅接入、协议转换和调用调试。"}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={localizedPath(blogPathname(post.slug), language)}
              className="group rounded-lg border border-border/60 bg-background p-5 transition-colors hover:border-border hover:bg-muted/20"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {post.date || (post.kind === "guide" ? (english ? "Tutorial" : "教程") : (english ? "Blog" : "博客"))}
              </span>
              <h2 className="mt-2 font-semibold text-foreground group-hover:underline">{post.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

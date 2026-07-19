import Link from "next/link";
import type { AppLanguage } from "@/i18n/config";
import { blogPathname, type BlogPostMeta } from "@/lib/blog-data";
import { localizedPath } from "@/lib/seo-data";
import { GITHUB_REPO_URL } from "@/lib/site";

type LocalizedBlogPost = {
  meta: BlogPostMeta;
  html: string;
};

type BlogPostContentProps = {
  post: LocalizedBlogPost;
  related: BlogPostMeta[];
  language: AppLanguage;
};

export function BlogPostContent({ post, related, language }: BlogPostContentProps) {
  const english = language === "en";

  return (
    <div className="page-wrap relative">
      <article className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <nav className="text-sm text-muted-foreground">
          <Link href={localizedPath("/blog", language)} className="hover:text-foreground">
            {english ? "Articles" : "博客"}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{post.meta.title}</span>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{post.meta.title}</h1>
          {post.meta.date ? (
            <time dateTime={post.meta.date} className="mt-3 block text-sm text-muted-foreground">
              {post.meta.date}
            </time>
          ) : null}
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{post.meta.description}</p>
        </header>

        <div className="blog-prose mt-10 max-w-3xl" dangerouslySetInnerHTML={{ __html: post.html }} />

        <aside className="mt-12 max-w-3xl border-t border-border/60 pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {english ? "Published and maintained by " : "发布与维护："}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
              clovapi contributors
            </a>
            {english ? ". Source and change history are public." : "。源代码与变更记录公开可查。"}
          </p>

          {related.length ? (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-foreground">
                {english ? "Related articles" : "相关文章"}
              </h2>
              <ul className="mt-3 space-y-2">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={localizedPath(blogPathname(item.slug), language)}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <footer className="mt-12 max-w-3xl border-t border-border/60 pt-6">
          <Link href={localizedPath("/blog", language)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {english ? "Back to articles" : "返回博客"}
          </Link>
          <span className="mx-3 text-muted-foreground">·</span>
          <Link href={localizedPath("/skill", language)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {english ? "View Skill" : "查看 Skill"}
          </Link>
        </footer>
      </article>
    </div>
  );
}

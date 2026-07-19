import Link from "next/link";
import { notFound } from "next/navigation";
import { isAppLanguage } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/seo";
import { localizedPath } from "@/lib/seo-data";
import { GITHUB_REPO_URL } from "@/lib/site";

type AboutPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: AboutPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) return {};
  return buildPageMetadata("about", locale);
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();
  const english = locale === "en";

  return (
    <div className="page-wrap relative">
      <article className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-3xl px-5 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {english ? "About clovapi" : "关于 clovapi"}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {english
            ? "clovapi is an open-source local API proxy for connecting model subscriptions and custom upstreams through stable localhost endpoints."
            : "clovapi 是开源的本地模型 API 代理，通过稳定的 localhost 地址接入模型订阅和自定义上游。"}
        </p>

        <div className="blog-prose mt-10">
          <h2>{english ? "What the project owns" : "项目负责什么"}</h2>
          <p>
            {english
              ? "The repository contains a Go proxy core, an npm launcher, and an optional Electron desktop app. Provider profiles, credentials, and request logs remain on the computer running clovapi."
              : "仓库包含 Go 代理核心、npm 启动器和可选的 Electron 桌面端。Provider 配置、认证信息和请求日志保留在运行 clovapi 的电脑上。"}
          </p>
          <h2>{english ? "Open development" : "开放开发"}</h2>
          <p>
            {english
              ? "Source code, releases, and issue history are public on GitHub. Bugs and security-sensitive reports can be submitted through the repository."
              : "源代码、版本发布和问题记录都公开在 GitHub。Bug 和安全相关问题可以通过项目仓库反馈。"}
          </p>
          <p>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              {english ? "View the source and maintainers on GitHub" : "在 GitHub 查看源代码和维护记录"}
            </a>
          </p>
          <h2>{english ? "Privacy boundary" : "隐私边界"}</h2>
          <p>
            {english
              ? "clovapi is not a hosted model gateway. Read the privacy page for the distinction between local application data and ordinary website delivery logs."
              : "clovapi 不是托管模型网关。隐私说明进一步区分了本地应用数据与网站交付过程中产生的常规日志。"}
          </p>
          <p>
            <Link href={localizedPath("/privacy", locale)}>
              {english ? "Read the privacy notice" : "阅读隐私说明"}
            </Link>
          </p>
        </div>
      </article>
    </div>
  );
}

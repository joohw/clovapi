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
      <article className="site-container site-readable-container page-content page-content--with-bottom relative z-[1]">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {english ? "About clovapi" : "关于 clovapi"}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {english
            ? "clovapi is a shared model API network: use one platform API key to discover and call online models, without installing the CLI or contributing first."
            : "clovapi 是一个共享模型 API 网络：使用一个平台 API Key 即可发现并调用在线模型，无需安装 CLI 或先贡献资源。"}
        </p>

        <div className="blog-prose mt-10">
          <h2>{english ? "How sharing works" : "共享如何运作"}</h2>
          <p>
            {english
              ? "Consumers call models supplied by online contribution nodes and platform capacity. Contributors can connect resources they are authorized to share and control each node's availability and daily request limit."
              : "消费者调用在线贡献节点和平台节点提供的模型。贡献者可以接入已获授权的可共享资源，并控制每个节点的在线状态和每日请求上限。"}
          </p>
          <p>
            {english
              ? "clovapi supplements community supply with platform capacity when the same model and capabilities are available within budget. This does not promise unlimited access or availability for every model."
              : "当同模型、同能力和预算条件允许时，clovapi 会用平台资源补充社区供给。这不代表每个模型始终有资源，也不承诺无限调用。"}
          </p>
          <h2>{english ? "Current implementation" : "当前实现"}</h2>
          <p>
            {english
              ? "The console provides email verification, server-side sessions, hashed consumer API keys, online model discovery, shared model calls, and contribution-node controls. Credit settlement and free allowance grants are not enabled yet."
              : "控制台已经提供邮箱验证、服务端会话、仅存哈希的消费者 API Key、在线模型发现、共享模型调用与贡献节点控制。贡献积分结算和基础免费额度发放尚未启用。"}
          </p>
          <p>
            <Link href={localizedPath("/console", locale)}>
              {english ? "Open the console" : "进入控制台"}
            </Link>
          </p>
          <p>
            {english
              ? "The open-source CLI runs contribution nodes and keeps provider profiles, credentials, and request logs on the node. Its local proxy and OpenAI, Anthropic, and Gemini protocol bridge remain available as advanced capabilities. Consumers do not need the CLI."
              : "开源 CLI 用于运行贡献节点，Provider 配置、认证信息和请求日志保存在节点本地。本地代理以及 OpenAI、Anthropic、Gemini 协议适配继续作为高级能力保留；消费者无需安装 CLI。"}
          </p>
          <h2>{english ? "Open development" : "开放开发"}</h2>
          <p>
            {english
              ? "Source code, releases, and issue history are public on GitHub. Follow the repository for implementation progress and share feedback on the product experience."
              : "源代码、版本发布和问题记录都公开在 GitHub。你可以关注仓库了解实现进度，也可以反馈对共享机制和使用体验的建议。"}
          </p>
          <p>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              {english ? "View the source and maintainers on GitHub" : "在 GitHub 查看源代码和维护记录"}
            </a>
          </p>
          <h2>{english ? "Privacy boundary" : "隐私边界"}</h2>
          <p>
            {english
              ? "The privacy notice explains account data, credential handling, request routing boundaries, and the separate data path of the local contribution node."
              : "隐私说明覆盖账户数据、凭据处理、请求流转边界，以及本地贡献节点的独立数据路径。"}
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

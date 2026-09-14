import { notFound } from "next/navigation";
import { isAppLanguage } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/seo";

type PrivacyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PrivacyPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) return {};
  return buildPageMetadata("privacy", locale);
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) notFound();
  const english = locale === "en";

  return (
    <div className="page-wrap relative">
      <article className="site-container site-readable-container page-content page-content--with-bottom relative z-[1]">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {english ? "Privacy" : "隐私说明"}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {english ? "Last updated: September 14, 2026" : "最后更新：2026 年 9 月 14 日"}
        </p>

        <div className="blog-prose mt-10">
          <h2>{english ? "Console accounts" : "控制台账户"}</h2>
          <p>
            {english
              ? "The console stores your email address, hashed one-time codes, hashed session tokens, account data, hashed API keys, contribution rules, and credit ledger entries. The browser receives an HTTP-only session cookie. Resend processes the recipient address and verification email for account access."
              : "控制台会保存邮箱地址、经过哈希处理的一次性验证码和会话令牌、账户数据、仅存哈希的 API Key、贡献规则与积分账本。浏览器只接收 HttpOnly 会话 Cookie。Resend 会为账户登录处理收件地址和验证码邮件。"}
          </p>
          <p>
            {english
              ? "Upstream API credentials remain on the contribution node and are not uploaded to the control plane. Model prompts will follow the selected route and its disclosed data path when calling services are enabled."
              : "上游 API 凭据保留在贡献节点，不上传到控制面。调用服务启用后，模型提示词会按用户选择的路由及已披露的数据路径进行处理。"}
          </p>
          <h2>{english ? "Local application data" : "本地应用数据"}</h2>
          <p>
            {english
              ? "Provider profiles, upstream URLs, API keys, subscription sessions, and proxy request logs are stored on the machine running clovapi. The clovapi website does not receive model prompts or proxy traffic."
              : "Provider 配置、上游地址、API Key、订阅登录态和代理请求日志保存在运行 clovapi 的设备上。clovapi 网站不会接收模型提示词或代理流量。"}
          </p>
          <p>
            {english
              ? "When you use the local proxy to call a model, the request is sent to the upstream provider you configured. That provider's data handling terms apply to the request."
              : "通过本地代理调用模型时，请求会发送到你配置的上游服务，相关请求适用该上游的数据处理规则。"}
          </p>
          <h2>{english ? "Website delivery" : "网站交付"}</h2>
          <p>
            {english
              ? "The public website and download service may process ordinary network metadata such as IP address, user agent, requested URL, and timestamps for delivery, abuse prevention, and operational diagnostics."
              : "公开网站和下载服务可能为了内容交付、滥用防护与运行诊断处理常规网络元数据，例如 IP 地址、User-Agent、请求 URL 和时间戳。"}
          </p>
          <h2>{english ? "Language and theme preferences" : "语言与主题偏好"}</h2>
          <p>
            {english
              ? "The site can store interface preferences in the browser. These values do not contain provider credentials or model request content."
              : "网站可能在浏览器中保存界面偏好。这些数据不包含 provider 凭据或模型请求内容。"}
          </p>
          <h2>{english ? "Shared request data" : "共享请求数据"}</h2>
          <p>
            {english
              ? "When shared request routing is enabled, the service will disclose credential handling, request paths, usage records, retention and deletion, and which data the platform, contributors, and upstream providers can access. The local proxy and shared service have separate data paths."
              : "共享请求路由启用时，服务会说明凭据处理、请求流转、用量记录、保存与删除方式，以及平台、贡献者和上游各自可访问哪些数据。本地代理与共享服务使用各自独立的数据路径。"}
          </p>
          <h2>{english ? "Questions and changes" : "问题与更新"}</h2>
          <p>
            {english
              ? "Questions and corrections can be raised in the public GitHub repository. Material changes to this notice will update the date above."
              : "问题和更正可以在公开 GitHub 仓库中提出。本说明发生重要变化时，会同步更新上方日期。"}
          </p>
        </div>
      </article>
    </div>
  );
}

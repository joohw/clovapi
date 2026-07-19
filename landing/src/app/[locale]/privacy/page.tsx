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
      <article className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-3xl px-5 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {english ? "Privacy" : "隐私说明"}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {english ? "Last updated: July 19, 2026" : "最后更新：2026 年 7 月 19 日"}
        </p>

        <div className="blog-prose mt-10">
          <h2>{english ? "Local application data" : "本地应用数据"}</h2>
          <p>
            {english
              ? "Provider profiles, upstream URLs, API keys, subscription sessions, and proxy request logs are stored on the machine running clovapi. The clovapi website does not receive model prompts or proxy traffic."
              : "Provider 配置、上游地址、API Key、订阅登录态和代理请求日志保存在运行 clovapi 的设备上。clovapi 网站不会接收模型提示词或代理流量。"}
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

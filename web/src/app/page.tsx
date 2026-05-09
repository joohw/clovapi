"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { useToast } from "@/components/ui/toast-provider";

const API_EXAMPLES = [
  { label: "对话补全", suffix: "/chat/completions", docSlug: "chat-completions" },
  { label: "深度思考", suffix: "/responses", docSlug: "responses" },
  { label: "Claude Messages", suffix: "/messages", docSlug: "claude-messages" },
  { label: "在线搜索", suffix: "/search", docSlug: "search" },
  { label: "文本嵌入", suffix: "/embeddings", docSlug: "embeddings" },
  { label: "重排序", suffix: "/rerank", docSlug: "rerank" },
  { label: "图像生成", suffix: "/images/generations", docSlug: "images-generations" },
  { label: "语音合成", suffix: "/audio/speech", docSlug: "audio-speech" },
] as const;

const PROVIDER_LOGOS = [
  { id: "openai", alt: "OpenAI" },
  { id: "anthropic", alt: "Anthropic" },
  { id: "google", alt: "Google Gemini" },
  { id: "mistral", alt: "Mistral AI" },
  { id: "deepseek", alt: "DeepSeek" },
  { id: "xai", alt: "xAI" },
  { id: "azure", alt: "Microsoft Azure" },
  { id: "groq", alt: "Groq" },
  { id: "nvidia", alt: "NVIDIA" },
  { id: "cohere", alt: "Cohere" },
  { id: "huggingface", alt: "Hugging Face" },
  { id: "openrouter", alt: "OpenRouter" },
];

export default function HomePage() {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [status, setStatus] = useState<Record<string, any>>({});
  const [notice, setNotice] = useState("");
  const [homeContent, setHomeContent] = useState("");
  const [homeContentLoaded, setHomeContentLoaded] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [clientOrigin, setClientOrigin] = useState("");
  const envBase = (process.env.NEXT_PUBLIC_SERVER_URL || "").trim().replace(/\/+$/, "");

  const serverAddress = useMemo(() => {
    const fromStatus =
      typeof status?.server_address === "string"
        ? status.server_address.trim().replace(/\/+$/, "")
        : "";
    if (fromStatus) return fromStatus;
    if (envBase) return envBase;
    return clientOrigin;
  }, [status, envBase, clientOrigin]);
  const apiBaseUrl = useMemo(() => {
    if (!serverAddress) return "/v1";
    return serverAddress.endsWith("/v1") ? serverAddress : `${serverAddress}/v1`;
  }, [serverAddress]);
  const siteRoot = useMemo(
    () => String(serverAddress || "").replace(/\/+$/, "").replace(/\/v1$/, ""),
    [serverAddress],
  );
  const publicSiteUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || clientOrigin || "/",
    [clientOrigin],
  );

  useEffect(() => {
    setClientOrigin(window.location.origin);
    setHasSession(!!getStoredUser());
    const init = async () => {
      try {
        const [statusRes, noticeRes, homeRes] = await Promise.all([
          apiGet("/api/status"),
          apiGet("/api/notice"),
          apiGet("/api/home_page_content"),
        ]);
        if (statusRes?.success && statusRes?.data) {
          setStatus(statusRes.data);
          localStorage.setItem("status", JSON.stringify(statusRes.data));
        }
        if (noticeRes?.success && noticeRes.data) setNotice(String(noticeRes.data));
        if (homeRes?.success) {
          const data = String(homeRes.data || "");
          if (data && !data.startsWith("https://")) {
            setHomeContent(await renderMarkdown(data));
          } else {
            setHomeContent(data);
          }
        }
      } finally {
        setHomeContentLoaded(true);
      }
    };
    void init();
  }, []);

  async function copyBase() {
    try {
      await navigator.clipboard.writeText(apiBaseUrl);
      showSuccess("Base URL 已复制到剪贴板");
    } catch {
      showError("复制失败");
    }
  }

  async function copyExampleUrl(item: (typeof API_EXAMPLES)[number]) {
    const text = exampleFullUrl(item);
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("完整 URL 已复制到剪贴板");
    } catch {
      showError("复制失败");
    }
  }

  function goGetKey() {
    router.push(hasSession ? "/dashboard" : "/login");
  }

  function exampleFullUrl(item: { suffix?: string; fromRoot?: string }) {
    if (item.fromRoot) return `${siteRoot}${item.fromRoot}`;
    return `${apiBaseUrl.replace(/\/+$/, "")}${item.suffix || ""}`;
  }

  return (
    <div className="page-wrap">
      {notice ? (
        <div className="mb-4 border border-border bg-white p-3 text-sm dark:bg-zinc-900">
          {notice}
        </div>
      ) : null}

      {homeContentLoaded && !homeContent ? (
        <div className="w-full min-w-0">
          <div className="home-landing flex w-full min-w-0 flex-col">
            <section className="home-landing__panel w-full min-w-0 overflow-hidden border border-border p-4 text-center sm:p-5 md:p-8">
              <header>
                <p className="text-xs font-semibold tracking-wide text-zinc-500">为Agent设计的高性能API网关</p>
                <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
                  一站聚合，极速中转
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-foreground/85">
                  为Agent或者应用一键配置所有能力，只需将Base URL设置为
                </p>
              </header>

              <button
                type="button"
                className="home-landing__url-copy group relative mt-10 w-full min-w-0 cursor-pointer overflow-hidden border border-border bg-zinc-100/50 text-left transition-colors duration-150 hover:border-foreground/20 hover:bg-zinc-100 dark:bg-zinc-900/60 dark:hover:border-foreground/25 dark:hover:bg-zinc-800/90"
                aria-label="点击复制 Base URL"
                onClick={() => void copyBase()}
              >
                <div className="min-w-0 px-4 py-4 text-left sm:px-5 sm:py-4 sm:pr-14">
                  <span className="mb-1.5 block text-sm font-medium text-foreground/75">Base URL</span>
                  <code className="block break-all font-mono text-base leading-snug text-foreground sm:text-lg">
                    {apiBaseUrl}
                  </code>
                </div>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 z-[1] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm border border-border bg-zinc-200/50 text-foreground opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 dark:bg-zinc-800/50"
                  aria-hidden
                >
                  <Copy className="h-4 w-4 shrink-0" />
                </span>
              </button>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                <button className="btn h-11 min-h-11 px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base" onClick={goGetKey}>
                  获取密钥
                </button>
                <Link
                  href="/docs"
                  className="btn btn-outline inline-flex h-11 min-h-11 items-center px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base"
                >
                  查看教程
                </Link>
                {Boolean(status?.demo_site_enabled) && status?.version ? (
                  <button
                    className="btn btn-outline"
                    onClick={() =>
                      window.open("https://github.com/QuantumNous/new-api", "_blank")
                    }
                  >
                    {String(status.version)}
                  </button>
                ) : null}
              </div>

              <section className="mt-10">
                <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-foreground/70">
                  常用接口示例（完整 URL）
                </h2>
                <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
                  {API_EXAMPLES.map((item) => (
                    <li
                      key={item.label}
                      className="group relative m-0 min-w-0 overflow-hidden border border-border bg-zinc-100/50 text-left transition-colors duration-150 hover:border-foreground/20 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:hover:border-foreground/25 dark:hover:bg-zinc-800/80"
                    >
                      <Link
                        href={`/docs/${item.docSlug}`}
                        className="absolute inset-0 z-0 outline-offset-[-1px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label={`查看「${item.label}」接口文档`}
                      />
                      <div className="relative z-[1] p-4 pr-12 pointer-events-none sm:pr-14">
                        <span className="mb-1.5 block text-sm font-medium text-foreground/75">
                          {item.label}
                        </span>
                        <code className="block break-all font-mono text-base leading-snug text-foreground">
                          {exampleFullUrl(item)}
                        </code>
                      </div>
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-sm border border-border bg-zinc-200/50 text-foreground opacity-100 transition-[opacity,background-color,border-color] duration-150 hover:bg-zinc-300/80 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/80 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="复制完整 URL"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void copyExampleUrl(item);
                        }}
                      >
                        <Copy className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="home-landing__providers">
                <div className="home-landing__providers-rule" aria-hidden="true"></div>
                <section className="pt-10">
                  <h2 className="mb-5 text-sm font-medium text-foreground md:text-base">
                    支持 300+ 模型 API
                  </h2>
                  <div className="home-provider-strip mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-3.5 border border-border bg-zinc-100/40 px-5 py-4 leading-none sm:max-w-3xl md:gap-5 md:px-6 md:py-5 dark:bg-zinc-900/50">
                    {PROVIDER_LOGOS.map((provider) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={provider.id}
                        src={`/models-dev-logos/${provider.id}.svg`}
                        alt={provider.alt}
                        className="home-provider-icon"
                        width="32"
                        height="32"
                        loading="lazy"
                        decoding="async"
                      />
                    ))}
                  </div>
                </section>
              </div>
            </section>

            <footer className="mt-8 flex w-full flex-col items-center gap-1.5 pt-8 text-center md:mt-10 md:pt-10">
              <p className="text-base font-semibold tracking-tight text-foreground">
                <a href={publicSiteUrl} className="text-foreground">
                  CLOVAPI
                </a>
              </p>
              <p className="text-sm text-zinc-500">© 2026 CLOVAPI</p>
            </footer>
          </div>
        </div>
      ) : null}

      {homeContentLoaded && homeContent.startsWith("https://") ? (
        <iframe
          title="home-page-content"
          src={homeContent}
          style={{
            width: "100%",
            height: "calc(100dvh - var(--app-main-padding-top, 4.5rem))",
            border: "none",
          }}
        ></iframe>
      ) : null}

      {homeContentLoaded && homeContent && !homeContent.startsWith("https://") ? (
        <div className="panel p-4 prose prose-base max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:bg-zinc-200/50 dark:prose-pre:bg-zinc-800/70 prose-pre:border prose-pre:border-border prose-code:before:content-none prose-code:after:content-none">
          <div dangerouslySetInnerHTML={{ __html: homeContent }} />
        </div>
      ) : null}

    </div>
  );
}

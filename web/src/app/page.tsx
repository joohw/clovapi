"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Sparkles } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { useToast } from "@/components/ui/toast-provider";
import styles from "./page.module.css";

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
    <div className={`page-wrap ${styles.home}`}>
      {notice ? (
        <div className="mx-auto mb-6 max-w-6xl rounded-xl bg-muted/40 px-4 py-3 text-center text-sm leading-relaxed text-foreground/90 backdrop-blur-sm sm:text-left">
          {notice}
        </div>
      ) : null}

      {homeContentLoaded && !homeContent ? (
        <div className="w-full min-w-0">
          <div className="home-landing relative mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 pb-14 pt-1 sm:gap-10 sm:pb-16 sm:pt-2 md:pt-4">
            <section className="relative z-[1] w-full min-w-0 overflow-hidden rounded-2xl bg-background/85 px-5 py-8 text-center backdrop-blur-md dark:bg-background/75 sm:px-8 sm:py-10 md:px-10 md:py-12">
              <header className="relative">
                <p className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <Sparkles className="size-3.5 shrink-0 text-muted-foreground/90" aria-hidden />
                  为 Agent 设计的高性能 API 网关
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
                  一站聚合，极速中转
                </h1>
                <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-[1.05rem]">
                  为 Agent 或应用一键接入主流模型与工具：将 Base URL 设为下方地址即可开始调用。
                </p>
              </header>

              <button
                type="button"
                className="group relative mt-10 w-full min-w-0 cursor-pointer overflow-hidden rounded-xl bg-muted/30 text-left transition-[background-color] duration-200 hover:bg-muted/45"
                aria-label="点击复制 Base URL"
                onClick={() => void copyBase()}
              >
                <div className="min-w-0 px-4 py-4 text-left sm:px-5 sm:py-5 sm:pr-16">
                  <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Base URL
                  </span>
                  <code className="block break-all font-mono text-base leading-snug text-foreground sm:text-lg">
                    {apiBaseUrl}
                  </code>
                </div>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 z-[1] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg bg-muted/80 text-foreground opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-hidden
                >
                  <Copy className="h-4 w-4 shrink-0" />
                </span>
              </button>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  className="btn inline-flex h-11 min-h-11 items-center gap-2 px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base"
                  onClick={goGetKey}
                >
                  获取密钥
                  <ArrowRight className="size-4 opacity-90" aria-hidden />
                </button>
                <Link
                  href="/docs"
                  className="btn btn-outline inline-flex h-11 min-h-11 items-center gap-2 px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base"
                >
                  查看教程
                  <ArrowRight className="size-4 opacity-70" aria-hidden />
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
            </section>

            <section className="relative z-[1] overflow-hidden rounded-2xl bg-background/75 backdrop-blur-md dark:bg-background/65">
              <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-3 pt-2 sm:grid-cols-2 sm:p-4 sm:pt-3">
                {API_EXAMPLES.map((item) => (
                  <li
                    key={item.label}
                    className="group relative m-0 min-w-0 overflow-hidden rounded-xl bg-muted/25 text-left transition-colors duration-150 hover:bg-muted/40"
                  >
                    <Link
                      href={`/docs/${item.docSlug}`}
                      className="absolute inset-0 z-0 outline-offset-[-1px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label={`查看「${item.label}」接口文档`}
                    />
                    <div className="pointer-events-none relative z-[1] p-4 pr-12 sm:p-5 sm:pr-14">
                      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground/85">
                        {item.label}
                        <ArrowRight className="size-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-60" aria-hidden />
                      </span>
                      <code className="block break-all font-mono text-[0.9375rem] leading-snug text-foreground sm:text-base">
                        {exampleFullUrl(item)}
                      </code>
                    </div>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg bg-muted/80 text-foreground opacity-100 transition-opacity duration-150 hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
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

            <div className="relative z-[1] overflow-hidden rounded-2xl bg-background/75 px-5 py-8 backdrop-blur-md dark:bg-background/65 sm:px-7 sm:py-9">
              <section>
                <div className="mb-6 flex flex-col gap-1 text-left sm:flex-row sm:items-end sm:justify-between">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
                    支持 300+ 模型 API
                  </h2>
                </div>
                <div className={`${styles.providerStrip} flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-4 px-0 py-1 leading-none md:justify-between md:gap-x-7 md:px-1`}>
                  {PROVIDER_LOGOS.map((provider) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={provider.id}
                      src={`/models-dev-logos/${provider.id}.svg`}
                      alt={provider.alt}
                      className={`${styles.providerIcon} opacity-90 transition-opacity duration-200 hover:opacity-100`}
                      width="32"
                      height="32"
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              </section>
            </div>

            <footer className="relative z-[1] mt-4 flex w-full flex-col items-center gap-2 pt-10 text-center">
              <p className="text-[0.95rem] font-semibold tracking-tight">
                <a href={publicSiteUrl} className="text-foreground transition-colors hover:text-muted-foreground">
                  CLOVAPI
                </a>
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                © 2026 CLOVAPI
              </p>
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
        <div className="prose prose-base max-w-none p-0 dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:bg-muted/30 prose-code:before:content-none prose-code:after:content-none">
          <div dangerouslySetInnerHTML={{ __html: homeContent }} />
        </div>
      ) : null}

    </div>
  );
}
